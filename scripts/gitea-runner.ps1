[CmdletBinding()]
param(
    [ValidateSet('Check', 'Register', 'Start', 'Stop', 'Status', 'Logs')]
    [string]$Action = 'Check'
)

$ErrorActionPreference = 'Stop'
$runnerDirectory = Join-Path $PSScriptRoot '../infrastructure/gitea-runner'
$composeFile = Join-Path $runnerDirectory 'compose.yaml'
$instanceUrl = 'https://sdp.ms.wits.ac.za'
$runnerLabel = 'sportcoaching-linux:docker://ghcr.io/catthehacker/ubuntu:act-22.04'

function Invoke-RunnerCompose {
    param([string[]]$ComposeArguments)
    & docker compose --project-directory $runnerDirectory --file $composeFile @ComposeArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed (exit $LASTEXITCODE)."
    }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Install Docker Desktop, select Linux containers, and start its engine first.'
}

Invoke-RunnerCompose -ComposeArguments @('config', '--quiet')
# Windows PowerShell treats redirected native stderr as an error record.
# Let the explicit exit-code check produce the useful prerequisite message.
$savedErrorPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    $dockerOs = & docker info --format '{{.OSType}}' 2>$null
    $dockerInfoExitCode = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $savedErrorPreference
}
if ($dockerInfoExitCode -ne 0 -or "$dockerOs".Trim() -ne 'linux') {
    throw 'Docker Linux engine is unavailable. Open Docker Desktop and resolve its startup error. See docs/self-hosted-gitea-runner.md for the disabled WSL service fix.'
}

switch ($Action) {
    'Check' {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$instanceUrl/api/v1/version" -TimeoutSec 20
        Write-Host "Docker Linux engine is ready. Gitea replied: $($response.Content)"
        Write-Host 'Next: run this script with -Action Register and paste the repository runner token at the token prompt.'
    }
    'Register' {
        # Registration is interactive: the token is entered inside act_runner,
        # never put in a script, environment variable, or command-line argument.
        # Refuse to overwrite an existing registration or register twice.
        Invoke-RunnerCompose -ComposeArguments @(
            'run', '--rm', '--no-deps', '--entrypoint', 'sh', 'runner',
            '-c', 'if [ -s /data/.runner ]; then echo "Runner is already registered. Use -Action Start."; exit 1; fi'
        )
        Write-Host 'Use the REPOSITORY token from SportCoachingTool > Settings > Actions > Runners.'
        Write-Host "Instance URL: $instanceUrl"
        Write-Host 'Runner name: sportcoaching-runner'
        Write-Host "Runner labels: $runnerLabel"
        Invoke-RunnerCompose -ComposeArguments @(
            'run', '--rm', '--no-deps', 'runner', '--config', '/config.yaml', 'register',
            '--instance', $instanceUrl, '--name', 'sportcoaching-runner', '--labels', $runnerLabel
        )
        Invoke-RunnerCompose -ComposeArguments @('up', '-d', 'runner')
        Write-Host 'Runner daemon started. Check -Action Logs and confirm it is online in Gitea.'
    }
    'Start' {
        Invoke-RunnerCompose -ComposeArguments @(
            'run', '--rm', '--no-deps', '--entrypoint', 'sh', 'runner',
            '-c', 'test -s /data/.runner || { echo "Register the runner first with -Action Register."; exit 1; }'
        )
        Invoke-RunnerCompose -ComposeArguments @('up', '-d', 'runner')
    }
    'Stop' {
        # Registration and cache survive. Stop only when no CI job is active.
        Invoke-RunnerCompose -ComposeArguments @('stop', 'runner')
    }
    'Status' {
        Invoke-RunnerCompose -ComposeArguments @('ps', '-a')
    }
    'Logs' {
        Invoke-RunnerCompose -ComposeArguments @('logs', '--tail', '100', '-f', 'runner')
    }
}
