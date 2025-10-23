-- Add UI state to pods table for persisting user preferences
ALTER TABLE "pod" ADD COLUMN "ui_state" text;

