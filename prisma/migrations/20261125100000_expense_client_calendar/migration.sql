CREATE OR REPLACE FUNCTION "reject_future_expense_date"()
RETURNS trigger AS $$
DECLARE
    client_time_zone text := COALESCE(
        NULLIF(current_setting('splitcircle.client_time_zone', true), ''),
        'UTC'
    );
BEGIN
    IF NEW."expense_date" > (transaction_timestamp() AT TIME ZONE client_time_zone)::date THEN
        RAISE EXCEPTION 'expense_date cannot be in the future'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
