CREATE TABLE "legal_acceptance" (
  "user_id" text NOT NULL,
  "terms_version" text NOT NULL,
  "privacy_version" text NOT NULL,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "method" text NOT NULL,
  CONSTRAINT "legal_acceptance_pkey" PRIMARY KEY ("user_id", "terms_version", "privacy_version"),
  CONSTRAINT "legal_acceptance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade,
  CONSTRAINT "legal_acceptance_method_check" CHECK ("method" IN ('email_signup', 'google_signup'))
);
