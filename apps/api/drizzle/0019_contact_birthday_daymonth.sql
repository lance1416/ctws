ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birthday_daymonth_check" CHECK ("contacts"."birthday_day" is null
          or ("contacts"."birthday_calendar" = 'lunar' and "contacts"."birthday_day" <= 30)
          or ("contacts"."birthday_calendar" = 'solar' and "contacts"."birthday_day" <=
              (array[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])["contacts"."birthday_month"]));