-- Add email and password_hash columns to profiles table
-- This migration removes Supabase dependency and enables JWT auth

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text NOT NULL UNIQUE DEFAULT 'user@example.com';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT '';

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);

-- Drop default values after adding columns
ALTER TABLE profiles ALTER COLUMN email DROP DEFAULT;
ALTER TABLE profiles ALTER COLUMN password_hash DROP DEFAULT;
