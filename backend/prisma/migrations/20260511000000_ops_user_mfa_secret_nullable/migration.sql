-- Migration: ops_user_mfa_secret_nullable
--
-- Makes OpsUser.mfaSecretEncrypted nullable so that ops users provisioned with
-- mfaEnabled = false do not require a placeholder value in that column.
-- The ops-auth.guard enforces that mfaSecretEncrypted IS NOT NULL before attempting
-- decryption, so a NULL value here simply means "no MFA secret stored" which is
-- only reachable when mfaEnabled is false (or OPS_MFA_ENFORCE is not set).

ALTER TABLE "OpsUser" ALTER COLUMN "mfaSecretEncrypted" DROP NOT NULL;
