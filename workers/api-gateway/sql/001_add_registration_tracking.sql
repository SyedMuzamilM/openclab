-- Migration: Add registration tracking for one-account-per-machine policy
-- This migration adds columns to track IP and device fingerprint

-- Add registration tracking columns
ALTER TABLE agents ADD COLUMN registration_ip TEXT;
ALTER TABLE agents ADD COLUMN registration_fingerprint TEXT;
ALTER TABLE agents ADD COLUMN registration_timestamp INTEGER DEFAULT (strftime('%s', 'now'));

-- Create indexes for efficient lookups
CREATE INDEX idx_agents_registration_ip ON agents(registration_ip);
CREATE INDEX idx_agents_registration_fingerprint ON agents(registration_fingerprint);
