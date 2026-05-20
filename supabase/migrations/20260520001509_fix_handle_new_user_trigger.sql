/*
  # Fix handle_new_user trigger
  
  Updates the trigger function to read role, full_name, broker_id, and phone
  from raw_user_meta_data passed during signUp, so the app code doesn't need
  to do a separate profile INSERT (which caused duplicate key violations).
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, broker_id, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'broker'),
    NULLIF(NEW.raw_user_meta_data->>'broker_id', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
