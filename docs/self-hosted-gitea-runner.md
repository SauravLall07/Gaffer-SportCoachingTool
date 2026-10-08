# Group runner for university Gitea

This setup runs the university repository's CI on your own Windows computer
using Docker Desktop's Linux engine. Registration belongs to **SportCoachingTool
only**; the custom `sportcoaching-linux` label directs its test jobs to this
runner. No registration token belongs in Git or in chat.

## Finish setup on this computer

1. Fix Docker Desktop startup. During preparation on 8 October 2026, Docker
   Desktop was installed, but the Linux engine was unavailable and the Windows
   `WslService` service was disabled. Open **PowerShell as Administrator** and run:

   ```powershell
   Set-Service -Name WslService -StartupType Manual
   Start-Service -Name WslService
   ```

   Open Docker Desktop, or restart it if it is already open. Wait until the
   Linux engine is running. If Docker still reports an error, resolve that
   specific error before continuing; these two commands do not verify that
   virtualization and all WSL prerequisites are installed.

2. In a regular PowerShell terminal at the repository root, check prerequisites:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\gitea-runner.ps1 -Action Check
   ```

3. Open the repository runner settings:
   <https://sdp.ms.wits.ac.za/SDP-Interlude/SportCoachingTool/settings/actions/runners>.
   Select the option to create/register a runner and copy its registration token.
   Use the repository token, not an organization-wide or instance-wide token.

4. Run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\gitea-runner.ps1 -Action Register
   ```

   Paste the token when `act_runner` prompts for it. The script supplies the
   instance URL, name, and label. If the runner asks for those values again, use
   the values printed by the script. The first run downloads the runner image;
   the first CI job also downloads a larger Ubuntu job image.

5. Confirm Gitea shows `sportcoaching-runner` **online** with the label
   `sportcoaching-linux`. Check startup errors with:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\gitea-runner.ps1 -Action Logs
   ```

6. Only after the runner is online, commit and push the prepared changes to your
   normal working branch and update/open its pull request. The Test workflow
   triggers on PRs targeting `main`, `develop`, or `development`, and pushes to
   those branches. Confirm a new job names your runner and completes. An older
   run uses its old workflow revision: rerunning it may still use shared runners.

The local workflow now targets your custom label. Until it is pushed, hosted CI
keeps using the existing workflow. After it is pushed, matching jobs wait whenever
your runner is offline; there is no automatic fallback to the university runners.

## Daily operation

Run the same script with `-Action Status`, `Start`, `Logs`, or `Stop` as needed.
Ctrl+C exits log viewing without stopping the runner. Stop only after active CI
jobs finish; stopping the daemon is not a way to cancel jobs. Cancel a workflow
through Gitea first. Keep Windows awake and Docker running while jobs are needed.
Docker restart policy restarts the daemon when Docker starts; it does not start
Docker Desktop itself after a Windows reboot.

The runner accepts one job at a time. That avoids competing Chromium instances
on this machine. A workflow's jobs can still queue behind one another, and older
runs can still queue ahead of new ones; cancel superseded runs for your group in
Gitea. No workflow concurrency feature is assumed for this university version.

Existing Gitea secrets supply the test database and SonarQube configuration. The
job containers must reach Gitea, package registries, the configured test database,
and the configured SonarQube server. A service reachable only from campus may
require the university VPN. A passing prerequisite check only verifies Windows
can reach Gitea, not every job dependency or Docker container's connectivity.

## Storage, networking, and trust

- Registration credentials and npm action caches live in the Docker named volume
  `sportcoaching-ci_runner-data`, outside OneDrive and the Git checkout. Keep that
  volume private; deleting it loses the registration and cache.
- Both runner and job containers use `sportcoaching-ci-jobs`. The cache hostname
  `sportcoaching-runner:8088` is reachable inside that network, without publishing
  a cache port on Windows. Chromium gets 1 GiB of shared memory.
- This setup mounts Docker's socket into the runner. Run only trusted repository
  workflows; repository scope limits which repositories use the runner but is
  not a security sandbox against malicious workflow code. A dedicated machine
  or VM is preferable when executing other people's code.
- Images use a stable runner channel and the `act-22.04` Ubuntu job image. After
  the first successful run, consider pinning tested image digests for repeatable
  upgrades. Image pulls, registration, cache restoration and full CI remain to
  be verified on this computer after Docker is repaired.

## Return to shared runners

Change all five `runs-on: sportcoaching-linux` entries in
`.gitea/workflows/test.yml` back to `runs-on: ubuntu-latest`, then commit and push.
The independent GitHub production health workflow is not changed by this setup.

Reference: [Gitea act_runner documentation](https://docs.gitea.com/1.25/usage/actions/act-runner/).
