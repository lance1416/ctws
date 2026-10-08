-- 「想读完的那天」. A PLAN, not a deadline: nothing goes overdue here. It exists so a reading list
-- can answer 「这周想读完哪本」, and so the calendar has a second module's worth of dated things --
-- a contribution point validated by one module would just be the task module's shape.
ALTER TABLE "reading_items" ADD COLUMN "plan_on" date;
