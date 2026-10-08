-- 「A 没做完 B 做不了」 (D64). A second graph, entirely separate from the parent tree: the tree
-- says what a piece of work is made of, this says what has to happen first. Siblings may depend
-- on each other and so may tasks in different projects, so there is no containment between them.
CREATE TABLE "task_dependencies" (
  "blocker_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "blocked_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("blocker_id", "blocked_id"),
  -- A task cannot wait for itself. Longer loops are refused by the cycle check in the service;
  -- this one is the loop a single bad request can make, so the database refuses it outright.
  CONSTRAINT "task_dependencies_not_self" CHECK ("blocker_id" <> "blocked_id")
);
--> statement-breakpoint
-- "what is this task waiting for", which is also the direction the cycle check walks.
CREATE INDEX "task_dependencies_blocked_idx" ON "task_dependencies" ("blocked_id");
