/*
  # Update handle_new_user trigger to generate employee codes

  - Brokers already get a broker_code in the brokers table
  - Employees now get a unique EMP-XXXXX code in profiles.employee_code
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  emp_code text;
BEGIN
  -- Generate employee code for employees
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'broker') = 'employee' THEN
    emp_code := 'EMP-' || upper(substring(md5(NEW.id::text) from 1 for 6));
  END IF;

  INSERT INTO public.profiles (id, full_name, role, broker_id, phone, employee_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'broker'),
    NULLIF(NEW.raw_user_meta_data->>'broker_id', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    emp_code
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
