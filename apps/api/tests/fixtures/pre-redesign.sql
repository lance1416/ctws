--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
--



--
-- Data for Name: workspaces; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.workspaces VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', '2026-10-20 12:29:43.976+00');
INSERT INTO public.workspaces VALUES ('01a1594a-03c2-7792-852d-cd90e4dfaa7f', '2026-10-20 12:29:45.282+00');


--
-- Data for Name: links; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'person', '01a1594a-000b-716f-9b4d-d7bd59b4de5c', 'project', '01a15949-ff44-70da-9fcd-478274bf96ab', 'belongs', '2026-10-20 12:29:44.33+00', '01a1594a-0011-7191-a66d-d8b5f1f66ae8');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'person', '01a1594a-0032-73e1-9a54-c1d9345d786e', 'project', '01a15949-ff44-70da-9fcd-478274bf96ab', 'belongs', '2026-10-20 12:29:44.369+00', '01a1594a-0034-750a-9029-f6e0af213c29');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'person', '01a1594a-0032-73e1-9a54-c1d9345d786e', 'project', '01a15949-ff16-7482-bb0a-600d12a222c4', 'belongs', '2026-10-20 12:29:44.369+00', '01a1594a-0034-750a-9029-f88351077cec');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'meeting', '01a1594a-01b5-74e5-9653-b4bd560f4d9f', 'person', '01a1594a-0032-73e1-9a54-c1d9345d786e', 'attends', '2026-10-20 12:29:44.752+00', '01a1594a-01ba-7373-a3ab-a377ce49166d');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'meeting', '01a1594a-01b5-74e5-9653-b4bd560f4d9f', 'person', '01a1594a-0067-77e5-8318-630f320d356f', 'attends', '2026-10-20 12:29:44.752+00', '01a1594a-01ba-7373-a3ab-a71677a6d331');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'meeting', '01a1594a-01b5-74e5-9653-b4bd560f4d9f', 'project', '01a15949-ff6b-75e7-aad9-31de40d3e66a', 'belongs', '2026-10-20 12:29:44.752+00', '01a1594a-01bb-731f-8bb0-1f3558fefe14');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'meeting', '01a1594a-01ee-7330-a5a7-73a4518e7ee9', 'person', '01a1594a-000b-716f-9b4d-d7bd59b4de5c', 'attends', '2026-10-20 12:29:44.813+00', '01a1594a-01f0-708c-8f84-46c4b6b52c24');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'meeting', '01a1594a-01ee-7330-a5a7-73a4518e7ee9', 'project', '01a15949-ff91-7367-94ba-797cfdd6a22b', 'belongs', '2026-10-20 12:29:44.813+00', '01a1594a-01f1-7301-97e4-987807e77fcf');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'reading', '01a1594a-0203-7012-8be7-ef379a7be436', 'project', '01a15949-ffd5-713b-ad09-3a5ff637c775', 'belongs', '2026-10-20 12:29:44.852+00', '01a1594a-0219-7189-ab26-b9b0d1695d8e');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'person', '01a1594a-0032-73e1-9a54-c1d9345d786e', 'reading', '01a1594a-0203-7012-8be7-ef379a7be436', 'recommends', '2026-10-20 12:29:44.984+00', '01a1594a-029b-751b-a0c8-cff34c639007');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'person', '01a1594a-0058-760f-ac06-7e448e948f6a', 'reading', '01a1594a-0203-7012-8be7-ef379a7be436', 'recommends', '2026-10-20 12:29:45.001+00', '01a1594a-02ab-736b-ad26-47bea7a4230d');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'person', '01a1594a-0067-77e5-8318-630f320d356f', 'reading', '01a1594a-0229-70ee-ad5a-7b74c80e944a', 'recommends', '2026-10-20 12:29:45.015+00', '01a1594a-02b9-733e-96d7-e9c1d6a51f22');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'task', '01a1594a-007d-746e-978a-b303ba77c97f', 'person', '01a1594a-0058-760f-ac06-7e448e948f6a', 'about', '2026-10-20 12:29:45.03+00', '01a1594a-02c8-70ad-b22d-ecde70a6c8ed');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'task', '01a1594a-0183-74bd-97f7-a9fef09e6b8c', 'meeting', '01a1594a-01ee-7330-a5a7-73a4518e7ee9', 'about', '2026-10-20 12:29:45.044+00', '01a1594a-02d6-73e9-a4fa-df2e80c7c4e6');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'reading', '01a1594a-0229-70ee-ad5a-7b74c80e944a', 'task', '01a1594a-00be-76c9-864f-54a3412b92c2', 'about', '2026-10-20 12:29:45.058+00', '01a1594a-02e5-77f7-9371-e9e449f65eb0');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'person', '01a1594a-0046-777f-88d6-d33725e8f33c', 'task', '01a1594a-00ef-7379-8556-5f7a9daa58be', 'about', '2026-10-20 12:29:45.072+00', '01a1594a-02f3-75fd-a473-47a8314f0344');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'meeting', '01a1594a-0352-777a-b411-f77b9006975d', 'person', '01a1594a-0330-7081-863b-0b3e1f614005', 'attends', '2026-10-20 12:29:45.169+00', '01a1594a-0354-73f2-afdf-50ece74d59f8');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'meeting', '01a1594a-0352-777a-b411-f77b9006975d', 'project', '01a15949-ffd5-713b-ad09-3a5ff637c775', 'belongs', '2026-10-20 12:29:45.169+00', '01a1594a-0355-726f-bbd9-fc196dfc3eda');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'person', '01a1594a-0330-7081-863b-0b3e1f614005', 'task', '01a1594a-0369-7570-b0eb-b5941d09a28c', 'about', '2026-10-20 12:29:45.206+00', '01a1594a-0379-75ad-af7b-7a991541c00e');
INSERT INTO public.links VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', 'task', '01a1594a-0183-74bd-97f7-a9fef09e6b8c', 'person', '01a1594a-039b-71b5-9810-db238d1265cb', 'about', '2026-10-20 12:29:45.257+00', '01a1594a-03ac-7406-9aca-ce2c7dbf47d7');
INSERT INTO public.links VALUES ('01a1594a-03c2-7792-852d-cd90e4dfaa7f', 'person', '01a1594a-0400-7278-a111-3d7e5331e70c', 'project', '01a1594a-03f1-7349-9473-ecf1b4e9f38a', 'belongs', '2026-10-20 12:29:45.343+00', '01a1594a-0401-7611-bbe4-0d6b935e6056');


--
-- Data for Name: meetings; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.meetings VALUES ('01a1594a-01b5-74e5-9653-b4bd560f4d9f', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'rust-analyzer sync', '2026-09-11T10:30', 'Europe/London', 30, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR', 'https://meet.google.com/abc-defg-hij', '# Standing agenda

- Open PRs
- Flaky tests
', NULL, '2026-10-20 12:29:44.752+00', '2026-10-20 12:29:44.788+00', '2026-09-11 09:30:00+00', NULL);
INSERT INTO public.meetings VALUES ('01a1594a-01ee-7330-a5a7-73a4518e7ee9', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Flat viewing', '2026-10-21T18:00', 'Europe/London', 45, NULL, 'Flat 3, 12 Mare Street, London E8', NULL, NULL, '2026-10-20 12:29:44.813+00', '2026-10-20 12:29:44.813+00', '2026-10-21 17:00:00+00', '2026-10-21 17:45:00+00');
INSERT INTO public.meetings VALUES ('01a1594a-0352-777a-b411-f77b9006975d', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Thesis check-in', '2026-10-23T15:00', 'Europe/London', 30, NULL, 'Zoom: https://zoom.us/j/123456789', NULL, NULL, '2026-10-20 12:29:45.169+00', '2026-10-20 12:29:45.169+00', '2026-10-23 14:00:00+00', '2026-10-23 14:30:00+00');


--
-- Data for Name: meeting_exceptions; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.meeting_exceptions VALUES ('01a1594a-01b5-74e5-9653-b4bd560f4d9f', '2026-09-25T10:30', false, '2026-09-25T11:00', NULL);


--
-- Data for Name: people; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.people VALUES ('01a1594a-000b-716f-9b4d-d7bd59b4de5c', '01a15949-fea9-74c2-a2ff-ea07877474e5', '欧阳娜娜', 'Stripe', NULL, NULL, '2026-10-20 12:29:44.33+00', '2026-10-20 12:29:44.33+00', 'lunar', NULL, 9, 20, false, NULL, 7, NULL, 'Chengdu, Sichuan, China', 'Shanghai, China', 'Product manager', 'family');
INSERT INTO public.people VALUES ('01a1594a-0032-73e1-9a54-c1d9345d786e', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Mary Jane Watson', 'stripe', NULL, NULL, '2026-10-20 12:29:44.369+00', '2026-10-20 12:29:44.369+00', 'solar', 1992, 11, 4, false, NULL, 7, NULL, NULL, 'London, England, United Kingdom', 'Staff engineer', 'friend');
INSERT INTO public.people VALUES ('01a1594a-0046-777f-88d6-d33725e8f33c', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Cher', NULL, NULL, NULL, '2026-10-20 12:29:44.39+00', '2026-10-20 12:29:44.39+00', NULL, NULL, NULL, NULL, false, NULL, 7, NULL, NULL, NULL, 'Singer', 'work');
INSERT INTO public.people VALUES ('01a1594a-0058-760f-ac06-7e448e948f6a', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Li, Wendy', 'Stripe Inc.', NULL, NULL, '2026-10-20 12:29:44.407+00', '2026-10-20 12:29:44.407+00', NULL, NULL, NULL, NULL, false, NULL, 7, NULL, NULL, 'Shenzhen, Guangdong, China', 'Recruiter', 'work');
INSERT INTO public.people VALUES ('01a1594a-0067-77e5-8318-630f320d356f', '01a15949-fea9-74c2-a2ff-ea07877474e5', '王 磊', 'Tencent', NULL, NULL, '2026-10-20 12:29:44.423+00', '2026-10-20 12:29:44.423+00', 'solar', NULL, 2, 29, false, NULL, 7, NULL, NULL, 'Shanghai, China', 'Engineer', 'friend');
INSERT INTO public.people VALUES ('01a1594a-0330-7081-863b-0b3e1f614005', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Ada Clarke', NULL, NULL, NULL, '2026-10-20 12:29:45.136+00', '2026-10-20 12:29:45.136+00', NULL, NULL, NULL, NULL, false, NULL, 7, NULL, NULL, 'Cambridge', NULL, 'work');
INSERT INTO public.people VALUES ('01a1594a-0340-72f7-9a72-46db908128d8', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Ben Shaw', NULL, NULL, NULL, '2026-10-20 12:29:45.152+00', '2026-10-20 12:29:45.152+00', NULL, NULL, NULL, NULL, false, NULL, 7, NULL, NULL, 'Cambridge, Massachusetts, United States', NULL, 'work');
INSERT INTO public.people VALUES ('01a1594a-039b-71b5-9810-db238d1265cb', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Former Agent', 'Foxtons', NULL, '2026-10-20 12:29:45.273+00', '2026-10-20 12:29:45.242+00', '2026-10-20 12:29:45.242+00', NULL, NULL, NULL, NULL, false, NULL, 7, NULL, NULL, NULL, NULL, 'work');
INSERT INTO public.people VALUES ('01a1594a-0400-7278-a111-3d7e5331e70c', '01a1594a-03c2-7792-852d-cd90e4dfaa7f', 'Nora Diaz', 'Stripe', NULL, NULL, '2026-10-20 12:29:45.343+00', '2026-10-20 12:29:45.343+00', NULL, NULL, NULL, NULL, false, NULL, 7, NULL, NULL, 'Toronto, Ontario, Canada', 'Account manager', 'work');


--
-- Data for Name: person_channels; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.person_channels VALUES ('01a1594a-0012-70b1-b164-3a5ea2c763dc', '01a1594a-000b-716f-9b4d-d7bd59b4de5c', 'email', 'nana@example.com', 'Work', 0);
INSERT INTO public.person_channels VALUES ('01a1594a-0035-71a3-866e-027e7c1132b8', '01a1594a-0032-73e1-9a54-c1d9345d786e', 'phone', '+44 20 7946 0958', NULL, 0);


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.projects VALUES ('01a15949-fee4-73a6-afe0-d2decbd77e56', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Inbox', 'project-1', 'a0', NULL, NULL, '2026-10-20 12:29:43.976+00', true);
INSERT INTO public.projects VALUES ('01a15949-ff16-7482-bb0a-600d12a222c4', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'CTWS', 'project-1', 'a1', NULL, NULL, '2026-10-20 12:29:44.081+00', false);
INSERT INTO public.projects VALUES ('01a15949-ff44-70da-9fcd-478274bf96ab', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Job hunt', 'project-2', 'a2', NULL, NULL, '2026-10-20 12:29:44.131+00', false);
INSERT INTO public.projects VALUES ('01a15949-ff6b-75e7-aad9-31de40d3e66a', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'rust-analyzer', 'project-3', 'a3', NULL, NULL, '2026-10-20 12:29:44.169+00', false);
INSERT INTO public.projects VALUES ('01a15949-ff91-7367-94ba-797cfdd6a22b', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Moving flat', 'project-4', 'a4', NULL, NULL, '2026-10-20 12:29:44.207+00', false);
INSERT INTO public.projects VALUES ('01a15949-ffb4-73b6-a34c-5ea3abc0401c', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Find a lawyer', 'project-5', 'a5', NULL, NULL, '2026-10-20 12:29:44.243+00', false);
INSERT INTO public.projects VALUES ('01a15949-ffd5-713b-ad09-3a5ff637c775', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'Thesis', 'project-6', 'a6', NULL, NULL, '2026-10-20 12:29:44.276+00', false);
INSERT INTO public.projects VALUES ('01a1594a-03e0-73f9-88ec-442da89a38b4', '01a1594a-03c2-7792-852d-cd90e4dfaa7f', 'Inbox', 'project-1', 'a0', NULL, NULL, '2026-10-20 12:29:45.282+00', true);
INSERT INTO public.projects VALUES ('01a1594a-03f1-7349-9473-ecf1b4e9f38a', '01a1594a-03c2-7792-852d-cd90e4dfaa7f', 'Side project', 'project-2', 'a1', NULL, NULL, '2026-10-20 12:29:45.328+00', false);


--
-- Data for Name: reading_items; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.reading_items VALUES ('01a1594a-0203-7012-8be7-ef379a7be436', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'book', 'Designing Data-Intensive Applications', NULL, 'Martin Kleppmann', 'reading', NULL, '2026-10-20 12:29:44.835+00', '2026-10-20 12:29:44.852+00', NULL, NULL, NULL);
INSERT INTO public.reading_items VALUES ('01a1594a-0229-70ee-ad5a-7b74c80e944a', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'link', 'How Stripe does payments', 'https://example.invalid/payments', NULL, 'todo', NULL, '2026-10-20 12:29:44.873+00', '2026-10-20 12:29:44.963+00', NULL, NULL, NULL);


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.users VALUES ('01a15949-fea8-70a1-b57e-2c70f37003af', 'lance@example.com', '$argon2id$v=19$m=19456,t=2,p=1$DdGDhTwBAunw5ItpJr2I/Q$qm8Qa8eA4LiABFevEBWAkmjaHNuONONz2JtxCDKHNyc', 'Europe/London', '2026-10-20 12:29:43.976+00', 'admin', NULL);
INSERT INTO public.users VALUES ('01a1594a-03c2-7792-852d-c96483519252', 'other@example.com', '$argon2id$v=19$m=19456,t=2,p=1$Q8HCeDIbtDRs68RmoZpF/g$VfnsQK3sJcvjfuPGPMdxvkoR4gO91Zy6FFsla0XXG98', 'America/Toronto', '2026-10-20 12:29:45.282+00', 'member', NULL);


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.sessions VALUES ('a69298e3-ced0-40e9-abe5-f4b61cdb596d', '01a15949-fea8-70a1-b57e-2c70f37003af', '2026-11-19 12:29:44.04+00', '2026-10-20 12:29:44.04+00', '2026-10-20 12:29:44.04+00', 'ae0b2f3261a66538a9e5f259c502075afb7ddf0444b70799c9bd41e29ba53ae4');
INSERT INTO public.sessions VALUES ('76f69ed0-6106-4fef-b0a7-4f87696f2554', '01a1594a-03c2-7792-852d-c96483519252', '2026-11-19 12:29:45.315+00', '2026-10-20 12:29:45.315+00', '2026-10-20 12:29:45.315+00', 'd4dc5d98faac0b5e8adc2e8bf5f7ed03712dba3f9d0505b1f9720465533ad0bc');


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.tasks VALUES ('01a1594a-007d-746e-978a-b303ba77c97f', '01a15949-ff44-70da-9fcd-478274bf96ab', NULL, 'Amazon', NULL, 'in_progress', NULL, NULL, 'a0', NULL, NULL, '2026-10-20 12:29:44.441+00', '2026-10-20 12:29:44.441+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-0092-7242-b25b-eb12116e6563', '01a15949-ff44-70da-9fcd-478274bf96ab', '01a1594a-007d-746e-978a-b303ba77c97f', 'SDE II, AWS Payments', NULL, 'todo', NULL, NULL, 'a0', NULL, NULL, '2026-10-20 12:29:44.461+00', '2026-10-20 12:29:44.461+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-00af-76ee-8f7a-25e210c036f8', '01a15949-ff44-70da-9fcd-478274bf96ab', '01a1594a-007d-746e-978a-b303ba77c97f', 'Prepare the system design round', NULL, 'todo', NULL, '2026-11-03 18:00:00+00', 'a1', NULL, NULL, '2026-10-20 12:29:44.49+00', '2026-10-20 12:29:44.49+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-00be-76c9-864f-54a3412b92c2', '01a15949-ff44-70da-9fcd-478274bf96ab', NULL, 'Stripe', NULL, 'todo', '2026-10-20', NULL, 'a1', NULL, NULL, '2026-10-20 12:29:44.509+00', '2026-10-20 12:29:44.509+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-00d0-713c-a9cd-212359dedbb2', '01a15949-ff44-70da-9fcd-478274bf96ab', '01a1594a-00be-76c9-864f-54a3412b92c2', 'Phone screen prep', NULL, 'todo', '2026-10-21', NULL, 'a0', NULL, NULL, '2026-10-20 12:29:44.524+00', '2026-10-20 12:29:44.524+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-00e0-739c-8dee-57455e9bf237', '01a15949-ff44-70da-9fcd-478274bf96ab', '01a1594a-00be-76c9-864f-54a3412b92c2', 'Send the take-home', NULL, 'todo', NULL, NULL, 'a1', NULL, NULL, '2026-10-20 12:29:44.541+00', '2026-10-20 12:29:44.541+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-00ef-7379-8556-5f7a9daa58be', '01a15949-ff44-70da-9fcd-478274bf96ab', NULL, 'Update the LinkedIn headline', NULL, 'todo', NULL, NULL, 'a2', NULL, NULL, '2026-10-20 12:29:44.557+00', '2026-10-20 12:29:44.557+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-00fd-74ac-922b-1625b9dbf43b', '01a15949-ff44-70da-9fcd-478274bf96ab', NULL, 'Book flights to Seattle', NULL, 'todo', NULL, NULL, 'a3', NULL, NULL, '2026-10-20 12:29:44.571+00', '2026-10-20 12:29:44.571+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-011d-7474-986e-d9281b80c69d', '01a15949-ff16-7482-bb0a-600d12a222c4', NULL, 'Redesign', NULL, 'todo', NULL, NULL, 'a0', NULL, NULL, '2026-10-20 12:29:44.603+00', '2026-10-20 12:29:44.603+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-012e-74cf-97a0-edb716864544', '01a15949-ff16-7482-bb0a-600d12a222c4', '01a1594a-011d-7474-986e-d9281b80c69d', 'Batch 2', NULL, 'todo', NULL, NULL, 'a0', NULL, NULL, '2026-10-20 12:29:44.618+00', '2026-10-20 12:29:44.618+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-013e-7308-bfab-984d0a386a04', '01a15949-ff16-7482-bb0a-600d12a222c4', '01a1594a-012e-74cf-97a0-edb716864544', 'Tokens', NULL, 'done', NULL, NULL, 'a0', '2026-10-20 12:29:44.635+00', NULL, '2026-10-20 12:29:44.635+00', '2026-10-20 12:29:44.635+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-0150-72f3-9c76-f3d93726dab6', '01a15949-ff16-7482-bb0a-600d12a222c4', '01a1594a-012e-74cf-97a0-edb716864544', 'Shell', NULL, 'in_progress', NULL, NULL, 'a1', NULL, NULL, '2026-10-20 12:29:44.651+00', '2026-10-20 12:29:44.651+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-0162-7483-8691-170946a226ec', '01a15949-ff16-7482-bb0a-600d12a222c4', '01a1594a-011d-7474-986e-d9281b80c69d', 'Old idea', NULL, 'backlog', NULL, NULL, 'a1', NULL, NULL, '2026-10-20 12:29:44.669+00', '2026-10-20 12:29:44.669+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-0173-703e-8801-1b2f80311a65', '01a15949-ff16-7482-bb0a-600d12a222c4', '01a1594a-011d-7474-986e-d9281b80c69d', 'Dropped idea', NULL, 'cancelled', NULL, NULL, 'a2', NULL, NULL, '2026-10-20 12:29:44.687+00', '2026-10-20 12:29:44.687+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-0183-74bd-97f7-a9fef09e6b8c', '01a15949-ff91-7367-94ba-797cfdd6a22b', NULL, '量一下客厅的尺寸', NULL, 'todo', '2026-10-18', NULL, 'a0', NULL, NULL, '2026-10-20 12:29:44.705+00', '2026-10-20 12:29:44.705+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-0193-7317-8f82-1331ad243221', '01a15949-fee4-73a6-afe0-d2decbd77e56', NULL, 'Call the letting agent about Hackney', NULL, 'todo', NULL, NULL, 'a0', NULL, NULL, '2026-10-20 12:29:44.721+00', '2026-10-20 12:29:44.721+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-01a1-74a1-9957-358d4885ddc6', '01a15949-fee4-73a6-afe0-d2decbd77e56', NULL, 'Ask Mira about the payments team', NULL, 'todo', NULL, NULL, 'a1', NULL, NULL, '2026-10-20 12:29:44.735+00', '2026-10-20 12:29:44.735+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-0301-7582-aaca-e060d2af69a2', '01a15949-ffd5-713b-ad09-3a5ff637c775', NULL, 'Literature review', NULL, 'todo', '2026-10-25', NULL, 'a0', NULL, NULL, '2026-10-20 12:29:45.087+00', '2026-10-20 12:29:45.087+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-0311-70f8-82d5-9c1b55a90cff', '01a15949-ffd5-713b-ad09-3a5ff637c775', '01a1594a-0301-7582-aaca-e060d2af69a2', 'Read the Kleppmann chapters', NULL, 'todo', '2026-10-23', NULL, 'a0', NULL, NULL, '2026-10-20 12:29:45.102+00', '2026-10-20 12:29:45.102+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-0322-7463-b931-68bd80a710e5', '01a15949-ffd5-713b-ad09-3a5ff637c775', '01a1594a-0301-7582-aaca-e060d2af69a2', 'Summarise the survey papers', NULL, 'todo', '2026-10-24', NULL, 'a1', NULL, NULL, '2026-10-20 12:29:45.119+00', '2026-10-20 12:29:45.119+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-0369-7570-b0eb-b5941d09a28c', '01a15949-ff91-7367-94ba-797cfdd6a22b', NULL, 'Compare removal companies', NULL, 'todo', NULL, NULL, 'a1', NULL, '2026-10-20 12:29:45.221+00', '2026-10-20 12:29:45.191+00', '2026-10-20 12:29:45.221+00', '01a15949-fea9-74c2-a2ff-ea07877474e5');
INSERT INTO public.tasks VALUES ('01a1594a-0414-72e6-b4fe-8eafe378b70b', '01a1594a-03f1-7349-9473-ecf1b4e9f38a', NULL, 'Write the pitch', NULL, 'todo', NULL, NULL, 'a0', NULL, NULL, '2026-10-20 12:29:45.362+00', '2026-10-20 12:29:45.362+00', '01a1594a-03c2-7792-852d-cd90e4dfaa7f');


--
-- Data for Name: task_dependencies; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.task_dependencies VALUES ('01a1594a-00ef-7379-8556-5f7a9daa58be', '01a1594a-00fd-74ac-922b-1625b9dbf43b', '01a15949-fea9-74c2-a2ff-ea07877474e5', '2026-10-20 12:29:44.586+00');


--
-- Data for Name: task_events; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.task_events VALUES ('01a1594a-007e-7268-af72-c21739c7323f', '01a1594a-007d-746e-978a-b303ba77c97f', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Amazon", "status": "in_progress", "parentId": null, "projectId": "01a15949-ff44-70da-9fcd-478274bf96ab"}, "from": null}', '2026-10-20 12:29:44.441+00');
INSERT INTO public.task_events VALUES ('01a1594a-0094-75b2-910b-32fbd530ca07', '01a1594a-0092-7242-b25b-eb12116e6563', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "SDE II, AWS Payments", "status": "todo", "parentId": "01a1594a-007d-746e-978a-b303ba77c97f", "projectId": "01a15949-ff44-70da-9fcd-478274bf96ab"}, "from": null}', '2026-10-20 12:29:44.461+00');
INSERT INTO public.task_events VALUES ('01a1594a-00b0-74d2-8a33-65e2704df171', '01a1594a-00af-76ee-8f7a-25e210c036f8', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Prepare the system design round", "status": "todo", "parentId": "01a1594a-007d-746e-978a-b303ba77c97f", "projectId": "01a15949-ff44-70da-9fcd-478274bf96ab"}, "from": null}', '2026-10-20 12:29:44.49+00');
INSERT INTO public.task_events VALUES ('01a1594a-00c0-7460-ac6a-970eee10b6ef', '01a1594a-00be-76c9-864f-54a3412b92c2', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Stripe", "status": "todo", "parentId": null, "projectId": "01a15949-ff44-70da-9fcd-478274bf96ab"}, "from": null}', '2026-10-20 12:29:44.509+00');
INSERT INTO public.task_events VALUES ('01a1594a-00d1-729a-a853-f4de345b3b8d', '01a1594a-00d0-713c-a9cd-212359dedbb2', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Phone screen prep", "status": "todo", "parentId": "01a1594a-00be-76c9-864f-54a3412b92c2", "projectId": "01a15949-ff44-70da-9fcd-478274bf96ab"}, "from": null}', '2026-10-20 12:29:44.524+00');
INSERT INTO public.task_events VALUES ('01a1594a-00e2-743e-ab18-f7ec0eaa337b', '01a1594a-00e0-739c-8dee-57455e9bf237', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Send the take-home", "status": "todo", "parentId": "01a1594a-00be-76c9-864f-54a3412b92c2", "projectId": "01a15949-ff44-70da-9fcd-478274bf96ab"}, "from": null}', '2026-10-20 12:29:44.541+00');
INSERT INTO public.task_events VALUES ('01a1594a-00f0-7283-b5d6-d0dbda527797', '01a1594a-00ef-7379-8556-5f7a9daa58be', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Update the LinkedIn headline", "status": "todo", "parentId": null, "projectId": "01a15949-ff44-70da-9fcd-478274bf96ab"}, "from": null}', '2026-10-20 12:29:44.557+00');
INSERT INTO public.task_events VALUES ('01a1594a-00fe-723c-b98d-faa60b0701a3', '01a1594a-00fd-74ac-922b-1625b9dbf43b', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Book flights to Seattle", "status": "todo", "parentId": null, "projectId": "01a15949-ff44-70da-9fcd-478274bf96ab"}, "from": null}', '2026-10-20 12:29:44.571+00');
INSERT INTO public.task_events VALUES ('01a1594a-0111-7669-9c24-916abf90621e', '01a1594a-00fd-74ac-922b-1625b9dbf43b', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'dependency_added', '{"blockerId": "01a1594a-00ef-7379-8556-5f7a9daa58be"}', '2026-10-20 12:29:44.586+00');
INSERT INTO public.task_events VALUES ('01a1594a-011e-7577-958e-4047c542887e', '01a1594a-011d-7474-986e-d9281b80c69d', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Redesign", "status": "todo", "parentId": null, "projectId": "01a15949-ff16-7482-bb0a-600d12a222c4"}, "from": null}', '2026-10-20 12:29:44.603+00');
INSERT INTO public.task_events VALUES ('01a1594a-012f-73c7-9187-171cab81b7ab', '01a1594a-012e-74cf-97a0-edb716864544', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Batch 2", "status": "todo", "parentId": "01a1594a-011d-7474-986e-d9281b80c69d", "projectId": "01a15949-ff16-7482-bb0a-600d12a222c4"}, "from": null}', '2026-10-20 12:29:44.618+00');
INSERT INTO public.task_events VALUES ('01a1594a-013f-7159-976f-b4140426d4a8', '01a1594a-013e-7308-bfab-984d0a386a04', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Tokens", "status": "done", "parentId": "01a1594a-012e-74cf-97a0-edb716864544", "projectId": "01a15949-ff16-7482-bb0a-600d12a222c4"}, "from": null}', '2026-10-20 12:29:44.635+00');
INSERT INTO public.task_events VALUES ('01a1594a-0151-756b-a7d3-f943060c94eb', '01a1594a-0150-72f3-9c76-f3d93726dab6', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Shell", "status": "in_progress", "parentId": "01a1594a-012e-74cf-97a0-edb716864544", "projectId": "01a15949-ff16-7482-bb0a-600d12a222c4"}, "from": null}', '2026-10-20 12:29:44.651+00');
INSERT INTO public.task_events VALUES ('01a1594a-0162-7483-8691-1b0e0b4b1f66', '01a1594a-0162-7483-8691-170946a226ec', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Old idea", "status": "backlog", "parentId": "01a1594a-011d-7474-986e-d9281b80c69d", "projectId": "01a15949-ff16-7482-bb0a-600d12a222c4"}, "from": null}', '2026-10-20 12:29:44.669+00');
INSERT INTO public.task_events VALUES ('01a1594a-0174-7020-9eab-d99fd08bc29a', '01a1594a-0173-703e-8801-1b2f80311a65', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Dropped idea", "status": "cancelled", "parentId": "01a1594a-011d-7474-986e-d9281b80c69d", "projectId": "01a15949-ff16-7482-bb0a-600d12a222c4"}, "from": null}', '2026-10-20 12:29:44.687+00');
INSERT INTO public.task_events VALUES ('01a1594a-0184-761e-9bf2-fca00b0d328d', '01a1594a-0183-74bd-97f7-a9fef09e6b8c', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "量一下客厅的尺寸", "status": "todo", "parentId": null, "projectId": "01a15949-ff91-7367-94ba-797cfdd6a22b"}, "from": null}', '2026-10-20 12:29:44.705+00');
INSERT INTO public.task_events VALUES ('01a1594a-0194-7580-8842-344b96caecf7', '01a1594a-0193-7317-8f82-1331ad243221', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Call the letting agent about Hackney", "status": "todo", "parentId": null, "projectId": "01a15949-fee4-73a6-afe0-d2decbd77e56"}, "from": null}', '2026-10-20 12:29:44.721+00');
INSERT INTO public.task_events VALUES ('01a1594a-01a2-77d6-ae9a-7909db1253be', '01a1594a-01a1-74a1-9957-358d4885ddc6', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Ask Mira about the payments team", "status": "todo", "parentId": null, "projectId": "01a15949-fee4-73a6-afe0-d2decbd77e56"}, "from": null}', '2026-10-20 12:29:44.735+00');
INSERT INTO public.task_events VALUES ('01a1594a-0302-7168-a502-600f35817180', '01a1594a-0301-7582-aaca-e060d2af69a2', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Literature review", "status": "todo", "parentId": null, "projectId": "01a15949-ffd5-713b-ad09-3a5ff637c775"}, "from": null}', '2026-10-20 12:29:45.087+00');
INSERT INTO public.task_events VALUES ('01a1594a-0312-714b-b9d0-c06af2e3c940', '01a1594a-0311-70f8-82d5-9c1b55a90cff', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Read the Kleppmann chapters", "status": "todo", "parentId": "01a1594a-0301-7582-aaca-e060d2af69a2", "projectId": "01a15949-ffd5-713b-ad09-3a5ff637c775"}, "from": null}', '2026-10-20 12:29:45.102+00');
INSERT INTO public.task_events VALUES ('01a1594a-0323-7092-ac99-21dbe3bc5b1c', '01a1594a-0322-7463-b931-68bd80a710e5', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Summarise the survey papers", "status": "todo", "parentId": "01a1594a-0301-7582-aaca-e060d2af69a2", "projectId": "01a15949-ffd5-713b-ad09-3a5ff637c775"}, "from": null}', '2026-10-20 12:29:45.119+00');
INSERT INTO public.task_events VALUES ('01a1594a-036a-714d-9c5b-d8df4fba468d', '01a1594a-0369-7570-b0eb-b5941d09a28c', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'created', '{"to": {"title": "Compare removal companies", "status": "todo", "parentId": null, "projectId": "01a15949-ff91-7367-94ba-797cfdd6a22b"}, "from": null}', '2026-10-20 12:29:45.191+00');
INSERT INTO public.task_events VALUES ('01a1594a-0388-7453-a54a-dce82593dc38', '01a1594a-0369-7570-b0eb-b5941d09a28c', '01a15949-fea9-74c2-a2ff-ea07877474e5', 'deleted', '{}', '2026-10-20 12:29:45.221+00');
INSERT INTO public.task_events VALUES ('01a1594a-0415-7664-881d-cb6265d340b8', '01a1594a-0414-72e6-b4fe-8eafe378b70b', '01a1594a-03c2-7792-852d-cd90e4dfaa7f', 'created', '{"to": {"title": "Write the pitch", "status": "todo", "parentId": null, "projectId": "01a1594a-03f1-7349-9473-ecf1b4e9f38a"}, "from": null}', '2026-10-20 12:29:45.362+00');


--
-- Data for Name: workspace_members; Type: TABLE DATA; Schema: public; Owner: ctws
--

INSERT INTO public.workspace_members VALUES ('01a15949-fea9-74c2-a2ff-ea07877474e5', '01a15949-fea8-70a1-b57e-2c70f37003af', '2026-10-20 12:29:43.976+00');
INSERT INTO public.workspace_members VALUES ('01a1594a-03c2-7792-852d-cd90e4dfaa7f', '01a1594a-03c2-7792-852d-c96483519252', '2026-10-20 12:29:45.282+00');


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: ctws
--



--
-- PostgreSQL database dump complete
--


