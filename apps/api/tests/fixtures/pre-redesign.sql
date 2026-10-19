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
-- Data for Name: workspaces; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.workspaces VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', '2026-10-19 15:15:58.343+00');


--
-- Data for Name: links; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'person', '01a154bb-d637-722a-b504-2f99bf49fa9d', 'project', '01a154bb-d592-742d-8ef0-7b5e8f662045', 'belongs', '2026-10-19 15:15:58.645+00', '01a154bb-d63b-751a-a09c-f4017b272a46');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'person', '01a154bb-d658-7550-ba2f-19a18563999f', 'project', '01a154bb-d592-742d-8ef0-7b5e8f662045', 'belongs', '2026-10-19 15:15:58.679+00', '01a154bb-d65a-72ed-9818-245e34725eb6');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'person', '01a154bb-d658-7550-ba2f-19a18563999f', 'project', '01a154bb-d568-749f-97ab-7c747a1eaced', 'belongs', '2026-10-19 15:15:58.679+00', '01a154bb-d65a-72ed-9818-2bcad825198f');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'meeting', '01a154bb-d7c2-72ef-9f20-90b947df8a67', 'person', '01a154bb-d658-7550-ba2f-19a18563999f', 'attends', '2026-10-19 15:15:59.035+00', '01a154bb-d7c5-71d3-98ef-35fa27cddfe8');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'meeting', '01a154bb-d7c2-72ef-9f20-90b947df8a67', 'person', '01a154bb-d68d-7309-a751-68830eaaa225', 'attends', '2026-10-19 15:15:59.035+00', '01a154bb-d7c5-71d3-98ef-3ab40eafab87');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'meeting', '01a154bb-d7c2-72ef-9f20-90b947df8a67', 'project', '01a154bb-d5b1-72a2-b866-5bcafa95a600', 'belongs', '2026-10-19 15:15:59.035+00', '01a154bb-d7c7-7293-a9d2-1910797d4b0d');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'meeting', '01a154bb-d7f6-716c-909b-300a09bc7db6', 'person', '01a154bb-d637-722a-b504-2f99bf49fa9d', 'attends', '2026-10-19 15:15:59.092+00', '01a154bb-d7f7-71e9-bb47-dc9a0022c94f');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'meeting', '01a154bb-d7f6-716c-909b-300a09bc7db6', 'project', '01a154bb-d5cf-731f-8392-1200a713b0e4', 'belongs', '2026-10-19 15:15:59.092+00', '01a154bb-d7f8-7616-8178-a2b9727ea94d');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'reading', '01a154bb-d808-7597-aeb1-2afa80cb9d17', 'project', '01a154bb-d60c-76fa-98c3-dcf430f2e5f4', 'belongs', '2026-10-19 15:15:59.127+00', '01a154bb-d81b-73b0-9698-406e2358f401');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'person', '01a154bb-d658-7550-ba2f-19a18563999f', 'reading', '01a154bb-d808-7597-aeb1-2afa80cb9d17', 'recommends', '2026-10-19 15:15:59.239+00', '01a154bb-d889-7365-afcf-de4d98b0cf06');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'person', '01a154bb-d67a-75aa-b812-b875bd9e66e4', 'reading', '01a154bb-d808-7597-aeb1-2afa80cb9d17', 'recommends', '2026-10-19 15:15:59.26+00', '01a154bb-d89e-74ee-bc58-e1574339b1b9');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'person', '01a154bb-d68d-7309-a751-68830eaaa225', 'reading', '01a154bb-d828-760e-8c12-973bfc7dab7a', 'recommends', '2026-10-19 15:15:59.273+00', '01a154bb-d8ab-74b4-9f2d-04253d98159e');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'task', '01a154bb-d69f-7250-bcf4-74e6535774af', 'person', '01a154bb-d67a-75aa-b812-b875bd9e66e4', 'about', '2026-10-19 15:15:59.286+00', '01a154bb-d8b9-768f-9d5f-930c80e4f7bb');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'task', '01a154bb-d790-756b-92f9-19ba576ccf1c', 'meeting', '01a154bb-d7f6-716c-909b-300a09bc7db6', 'about', '2026-10-19 15:15:59.3+00', '01a154bb-d8c6-70c2-970b-f294af421660');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'reading', '01a154bb-d828-760e-8c12-973bfc7dab7a', 'task', '01a154bb-d6db-753b-816a-549816476ae1', 'about', '2026-10-19 15:15:59.313+00', '01a154bb-d8d2-7584-810b-a0ab076c67ff');
INSERT INTO public.links VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', 'person', '01a154bb-d66b-751a-a43a-265ea0b9f1fd', 'task', '01a154bb-d707-7533-84b3-2b307704b3aa', 'about', '2026-10-19 15:15:59.325+00', '01a154bb-d8df-74b9-9f30-5424486780ef');


--
-- Data for Name: meetings; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.meetings VALUES ('01a154bb-d7c2-72ef-9f20-90b947df8a67', '01a154bb-d509-76fa-a037-b00bee4ea923', 'rust-analyzer sync', '2026-09-11T10:30', 'Europe/London', 30, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR', 'https://meet.google.com/abc-defg-hij', '# Standing agenda

- Open PRs
- Flaky tests
', NULL, '2026-10-19 15:15:59.035+00', '2026-10-19 15:15:59.069+00', '2026-09-11 09:30:00+00', NULL);
INSERT INTO public.meetings VALUES ('01a154bb-d7f6-716c-909b-300a09bc7db6', '01a154bb-d509-76fa-a037-b00bee4ea923', 'Flat viewing', '2026-10-21T18:00', 'Europe/London', 45, NULL, 'Flat 3, 12 Mare Street, London E8', NULL, NULL, '2026-10-19 15:15:59.092+00', '2026-10-19 15:15:59.092+00', '2026-10-21 17:00:00+00', '2026-10-21 17:45:00+00');


--
-- Data for Name: meeting_exceptions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.meeting_exceptions VALUES ('01a154bb-d7c2-72ef-9f20-90b947df8a67', '2026-09-25T10:30', false, '2026-09-25T11:00', NULL);


--
-- Data for Name: people; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.people VALUES ('01a154bb-d637-722a-b504-2f99bf49fa9d', '01a154bb-d509-76fa-a037-b00bee4ea923', '欧阳娜娜', 'Stripe', NULL, NULL, '2026-10-19 15:15:58.645+00', '2026-10-19 15:15:58.645+00', 'lunar', NULL, 9, 20, false, NULL, 7, NULL, 'Chengdu, Sichuan, China', 'Shanghai, China', 'Product manager', 'family');
INSERT INTO public.people VALUES ('01a154bb-d658-7550-ba2f-19a18563999f', '01a154bb-d509-76fa-a037-b00bee4ea923', 'Mary Jane Watson', 'stripe', NULL, NULL, '2026-10-19 15:15:58.679+00', '2026-10-19 15:15:58.679+00', 'solar', 1992, 11, 4, false, NULL, 7, NULL, NULL, 'London, England, United Kingdom', 'Staff engineer', 'friend');
INSERT INTO public.people VALUES ('01a154bb-d66b-751a-a43a-265ea0b9f1fd', '01a154bb-d509-76fa-a037-b00bee4ea923', 'Cher', NULL, NULL, NULL, '2026-10-19 15:15:58.699+00', '2026-10-19 15:15:58.699+00', NULL, NULL, NULL, NULL, false, NULL, 7, NULL, NULL, NULL, 'Singer', 'work');
INSERT INTO public.people VALUES ('01a154bb-d67a-75aa-b812-b875bd9e66e4', '01a154bb-d509-76fa-a037-b00bee4ea923', 'Li, Wendy', 'Stripe Inc.', NULL, NULL, '2026-10-19 15:15:58.714+00', '2026-10-19 15:15:58.714+00', NULL, NULL, NULL, NULL, false, NULL, 7, NULL, NULL, 'Shenzhen, Guangdong, China', 'Recruiter', 'work');
INSERT INTO public.people VALUES ('01a154bb-d68d-7309-a751-68830eaaa225', '01a154bb-d509-76fa-a037-b00bee4ea923', '王 磊', 'Tencent', NULL, NULL, '2026-10-19 15:15:58.732+00', '2026-10-19 15:15:58.732+00', 'solar', NULL, 2, 29, false, NULL, 7, NULL, NULL, 'Shanghai, China', 'Engineer', 'friend');


--
-- Data for Name: person_channels; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.person_channels VALUES ('01a154bb-d63c-7113-9f1d-220f4908b031', '01a154bb-d637-722a-b504-2f99bf49fa9d', 'email', 'nana@example.com', 'Work', 0);
INSERT INTO public.person_channels VALUES ('01a154bb-d65b-767b-a4f0-a5429c121585', '01a154bb-d658-7550-ba2f-19a18563999f', 'phone', '+44 20 7946 0958', NULL, 0);


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.projects VALUES ('01a154bb-d53e-7454-8c91-ac42cc5ddb29', '01a154bb-d509-76fa-a037-b00bee4ea923', 'Inbox', 'project-1', 'a0', NULL, NULL, '2026-10-19 15:15:58.343+00', true);
INSERT INTO public.projects VALUES ('01a154bb-d568-749f-97ab-7c747a1eaced', '01a154bb-d509-76fa-a037-b00bee4ea923', 'CTWS', 'project-1', 'a1', NULL, NULL, '2026-10-19 15:15:58.436+00', false);
INSERT INTO public.projects VALUES ('01a154bb-d592-742d-8ef0-7b5e8f662045', '01a154bb-d509-76fa-a037-b00bee4ea923', 'Job hunt', 'project-2', 'a2', NULL, NULL, '2026-10-19 15:15:58.48+00', false);
INSERT INTO public.projects VALUES ('01a154bb-d5b1-72a2-b866-5bcafa95a600', '01a154bb-d509-76fa-a037-b00bee4ea923', 'rust-analyzer', 'project-3', 'a3', NULL, NULL, '2026-10-19 15:15:58.512+00', false);
INSERT INTO public.projects VALUES ('01a154bb-d5cf-731f-8392-1200a713b0e4', '01a154bb-d509-76fa-a037-b00bee4ea923', 'Moving flat', 'project-4', 'a4', NULL, NULL, '2026-10-19 15:15:58.541+00', false);
INSERT INTO public.projects VALUES ('01a154bb-d5ee-76df-a81b-eefff5d72302', '01a154bb-d509-76fa-a037-b00bee4ea923', 'Find a lawyer', 'project-5', 'a5', NULL, NULL, '2026-10-19 15:15:58.572+00', false);
INSERT INTO public.projects VALUES ('01a154bb-d60c-76fa-98c3-dcf430f2e5f4', '01a154bb-d509-76fa-a037-b00bee4ea923', 'Thesis', 'project-6', 'a6', NULL, NULL, '2026-10-19 15:15:58.602+00', false);


--
-- Data for Name: reading_items; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.reading_items VALUES ('01a154bb-d808-7597-aeb1-2afa80cb9d17', '01a154bb-d509-76fa-a037-b00bee4ea923', 'book', 'Designing Data-Intensive Applications', NULL, 'Martin Kleppmann', 'reading', NULL, '2026-10-19 15:15:59.112+00', '2026-10-19 15:15:59.127+00', NULL, NULL, NULL);
INSERT INTO public.reading_items VALUES ('01a154bb-d828-760e-8c12-973bfc7dab7a', '01a154bb-d509-76fa-a037-b00bee4ea923', 'link', 'How Stripe does payments', 'https://example.invalid/payments', NULL, 'todo', NULL, '2026-10-19 15:15:59.144+00', '2026-10-19 15:15:59.221+00', NULL, NULL, NULL);


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.tasks VALUES ('01a154bb-d69f-7250-bcf4-74e6535774af', '01a154bb-d592-742d-8ef0-7b5e8f662045', NULL, 'Amazon', NULL, 'in_progress', NULL, NULL, 'a0', NULL, NULL, '2026-10-19 15:15:58.749+00', '2026-10-19 15:15:58.749+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d6bb-7090-80c6-04260fc3eb3d', '01a154bb-d592-742d-8ef0-7b5e8f662045', '01a154bb-d69f-7250-bcf4-74e6535774af', 'SDE II, AWS Payments', NULL, 'todo', NULL, NULL, 'a0', NULL, NULL, '2026-10-19 15:15:58.766+00', '2026-10-19 15:15:58.766+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d6cd-749a-9462-e5c08745cf61', '01a154bb-d592-742d-8ef0-7b5e8f662045', '01a154bb-d69f-7250-bcf4-74e6535774af', 'Prepare the system design round', NULL, 'todo', NULL, '2026-11-03 18:00:00+00', 'a1', NULL, NULL, '2026-10-19 15:15:58.793+00', '2026-10-19 15:15:58.793+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d6db-753b-816a-549816476ae1', '01a154bb-d592-742d-8ef0-7b5e8f662045', NULL, 'Stripe', NULL, 'todo', '2026-10-20', NULL, 'a1', NULL, NULL, '2026-10-19 15:15:58.809+00', '2026-10-19 15:15:58.809+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d6ea-71e9-aba0-53b85c9c3437', '01a154bb-d592-742d-8ef0-7b5e8f662045', '01a154bb-d6db-753b-816a-549816476ae1', 'Phone screen prep', NULL, 'todo', '2026-10-21', NULL, 'a0', NULL, NULL, '2026-10-19 15:15:58.823+00', '2026-10-19 15:15:58.823+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d6f9-75b8-bb94-e72e8116dc81', '01a154bb-d592-742d-8ef0-7b5e8f662045', '01a154bb-d6db-753b-816a-549816476ae1', 'Send the take-home', NULL, 'todo', NULL, NULL, 'a1', NULL, NULL, '2026-10-19 15:15:58.838+00', '2026-10-19 15:15:58.838+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d707-7533-84b3-2b307704b3aa', '01a154bb-d592-742d-8ef0-7b5e8f662045', NULL, 'Update the LinkedIn headline', NULL, 'todo', NULL, NULL, 'a2', NULL, NULL, '2026-10-19 15:15:58.853+00', '2026-10-19 15:15:58.853+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d714-7733-b32c-a3675e582721', '01a154bb-d592-742d-8ef0-7b5e8f662045', NULL, 'Book flights to Seattle', NULL, 'todo', NULL, NULL, 'a3', NULL, NULL, '2026-10-19 15:15:58.866+00', '2026-10-19 15:15:58.866+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d733-747f-849e-87acc370cd55', '01a154bb-d568-749f-97ab-7c747a1eaced', NULL, 'Redesign', NULL, 'todo', NULL, NULL, 'a0', NULL, NULL, '2026-10-19 15:15:58.896+00', '2026-10-19 15:15:58.896+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d743-73db-bcac-e6609be6d74c', '01a154bb-d568-749f-97ab-7c747a1eaced', '01a154bb-d733-747f-849e-87acc370cd55', 'Batch 2', NULL, 'todo', NULL, NULL, 'a0', NULL, NULL, '2026-10-19 15:15:58.911+00', '2026-10-19 15:15:58.911+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d753-73a2-a9e2-a6344893001b', '01a154bb-d568-749f-97ab-7c747a1eaced', '01a154bb-d743-73db-bcac-e6609be6d74c', 'Tokens', NULL, 'done', NULL, NULL, 'a0', '2026-10-19 15:15:58.928+00', NULL, '2026-10-19 15:15:58.928+00', '2026-10-19 15:15:58.928+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d763-76d3-ba6a-88ebe950f7de', '01a154bb-d568-749f-97ab-7c747a1eaced', '01a154bb-d743-73db-bcac-e6609be6d74c', 'Shell', NULL, 'in_progress', NULL, NULL, 'a1', NULL, NULL, '2026-10-19 15:15:58.944+00', '2026-10-19 15:15:58.944+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d773-73a3-b3c3-23df9d5fb5fd', '01a154bb-d568-749f-97ab-7c747a1eaced', '01a154bb-d733-747f-849e-87acc370cd55', 'Old idea', NULL, 'backlog', NULL, NULL, 'a1', NULL, NULL, '2026-10-19 15:15:58.96+00', '2026-10-19 15:15:58.96+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d782-779c-bac7-093e8df87a3b', '01a154bb-d568-749f-97ab-7c747a1eaced', '01a154bb-d733-747f-849e-87acc370cd55', 'Dropped idea', NULL, 'cancelled', NULL, NULL, 'a2', NULL, NULL, '2026-10-19 15:15:58.974+00', '2026-10-19 15:15:58.974+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d790-756b-92f9-19ba576ccf1c', '01a154bb-d5cf-731f-8392-1200a713b0e4', NULL, '量一下客厅的尺寸', NULL, 'todo', '2026-10-18', NULL, 'a0', NULL, NULL, '2026-10-19 15:15:58.99+00', '2026-10-19 15:15:58.99+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d7a0-716d-a7bb-94dc94f55036', '01a154bb-d53e-7454-8c91-ac42cc5ddb29', NULL, 'Call the letting agent about Hackney', NULL, 'todo', NULL, NULL, 'a0', NULL, NULL, '2026-10-19 15:15:59.007+00', '2026-10-19 15:15:59.007+00', '01a154bb-d509-76fa-a037-b00bee4ea923');
INSERT INTO public.tasks VALUES ('01a154bb-d7ae-7752-9bb7-3616d4886496', '01a154bb-d53e-7454-8c91-ac42cc5ddb29', NULL, 'Ask Mira about the payments team', NULL, 'todo', NULL, NULL, 'a1', NULL, NULL, '2026-10-19 15:15:59.02+00', '2026-10-19 15:15:59.02+00', '01a154bb-d509-76fa-a037-b00bee4ea923');


--
-- Data for Name: task_dependencies; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.task_dependencies VALUES ('01a154bb-d707-7533-84b3-2b307704b3aa', '01a154bb-d714-7733-b32c-a3675e582721', '01a154bb-d509-76fa-a037-b00bee4ea923', '2026-10-19 15:15:58.879+00');


--
-- Data for Name: task_events; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.task_events VALUES ('01a154bb-d6a1-7695-83a2-c81a535ad133', '01a154bb-d69f-7250-bcf4-74e6535774af', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Amazon", "status": "in_progress", "parentId": null, "projectId": "01a154bb-d592-742d-8ef0-7b5e8f662045"}, "from": null}', '2026-10-19 15:15:58.749+00');
INSERT INTO public.task_events VALUES ('01a154bb-d6bc-736e-a677-3f08b785d1dd', '01a154bb-d6bb-7090-80c6-04260fc3eb3d', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "SDE II, AWS Payments", "status": "todo", "parentId": "01a154bb-d69f-7250-bcf4-74e6535774af", "projectId": "01a154bb-d592-742d-8ef0-7b5e8f662045"}, "from": null}', '2026-10-19 15:15:58.766+00');
INSERT INTO public.task_events VALUES ('01a154bb-d6ce-7337-b474-94701cb71f64', '01a154bb-d6cd-749a-9462-e5c08745cf61', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Prepare the system design round", "status": "todo", "parentId": "01a154bb-d69f-7250-bcf4-74e6535774af", "projectId": "01a154bb-d592-742d-8ef0-7b5e8f662045"}, "from": null}', '2026-10-19 15:15:58.793+00');
INSERT INTO public.task_events VALUES ('01a154bb-d6dc-7246-b89d-2ad0887543f7', '01a154bb-d6db-753b-816a-549816476ae1', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Stripe", "status": "todo", "parentId": null, "projectId": "01a154bb-d592-742d-8ef0-7b5e8f662045"}, "from": null}', '2026-10-19 15:15:58.809+00');
INSERT INTO public.task_events VALUES ('01a154bb-d6eb-761a-b7ff-6d71ef0c1045', '01a154bb-d6ea-71e9-aba0-53b85c9c3437', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Phone screen prep", "status": "todo", "parentId": "01a154bb-d6db-753b-816a-549816476ae1", "projectId": "01a154bb-d592-742d-8ef0-7b5e8f662045"}, "from": null}', '2026-10-19 15:15:58.823+00');
INSERT INTO public.task_events VALUES ('01a154bb-d6fb-77c6-9fd1-4d8978529f48', '01a154bb-d6f9-75b8-bb94-e72e8116dc81', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Send the take-home", "status": "todo", "parentId": "01a154bb-d6db-753b-816a-549816476ae1", "projectId": "01a154bb-d592-742d-8ef0-7b5e8f662045"}, "from": null}', '2026-10-19 15:15:58.838+00');
INSERT INTO public.task_events VALUES ('01a154bb-d708-775b-a5cd-3ce22c97864c', '01a154bb-d707-7533-84b3-2b307704b3aa', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Update the LinkedIn headline", "status": "todo", "parentId": null, "projectId": "01a154bb-d592-742d-8ef0-7b5e8f662045"}, "from": null}', '2026-10-19 15:15:58.853+00');
INSERT INTO public.task_events VALUES ('01a154bb-d714-7733-b32c-a70669eb5621', '01a154bb-d714-7733-b32c-a3675e582721', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Book flights to Seattle", "status": "todo", "parentId": null, "projectId": "01a154bb-d592-742d-8ef0-7b5e8f662045"}, "from": null}', '2026-10-19 15:15:58.866+00');
INSERT INTO public.task_events VALUES ('01a154bb-d726-7072-aef2-16e2fb9361c8', '01a154bb-d714-7733-b32c-a3675e582721', '01a154bb-d509-76fa-a037-b00bee4ea923', 'dependency_added', '{"blockerId": "01a154bb-d707-7533-84b3-2b307704b3aa"}', '2026-10-19 15:15:58.879+00');
INSERT INTO public.task_events VALUES ('01a154bb-d733-747f-849e-893a8968e8f7', '01a154bb-d733-747f-849e-87acc370cd55', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Redesign", "status": "todo", "parentId": null, "projectId": "01a154bb-d568-749f-97ab-7c747a1eaced"}, "from": null}', '2026-10-19 15:15:58.896+00');
INSERT INTO public.task_events VALUES ('01a154bb-d744-7353-962c-a72c090083ea', '01a154bb-d743-73db-bcac-e6609be6d74c', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Batch 2", "status": "todo", "parentId": "01a154bb-d733-747f-849e-87acc370cd55", "projectId": "01a154bb-d568-749f-97ab-7c747a1eaced"}, "from": null}', '2026-10-19 15:15:58.911+00');
INSERT INTO public.task_events VALUES ('01a154bb-d754-7361-a86b-5c1a52f56f32', '01a154bb-d753-73a2-a9e2-a6344893001b', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Tokens", "status": "done", "parentId": "01a154bb-d743-73db-bcac-e6609be6d74c", "projectId": "01a154bb-d568-749f-97ab-7c747a1eaced"}, "from": null}', '2026-10-19 15:15:58.928+00');
INSERT INTO public.task_events VALUES ('01a154bb-d764-7622-b0e1-f01ae9503c7e', '01a154bb-d763-76d3-ba6a-88ebe950f7de', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Shell", "status": "in_progress", "parentId": "01a154bb-d743-73db-bcac-e6609be6d74c", "projectId": "01a154bb-d568-749f-97ab-7c747a1eaced"}, "from": null}', '2026-10-19 15:15:58.944+00');
INSERT INTO public.task_events VALUES ('01a154bb-d773-73a3-b3c3-243ed65d55dc', '01a154bb-d773-73a3-b3c3-23df9d5fb5fd', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Old idea", "status": "backlog", "parentId": "01a154bb-d733-747f-849e-87acc370cd55", "projectId": "01a154bb-d568-749f-97ab-7c747a1eaced"}, "from": null}', '2026-10-19 15:15:58.96+00');
INSERT INTO public.task_events VALUES ('01a154bb-d783-73fd-8924-6386c341d4fc', '01a154bb-d782-779c-bac7-093e8df87a3b', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Dropped idea", "status": "cancelled", "parentId": "01a154bb-d733-747f-849e-87acc370cd55", "projectId": "01a154bb-d568-749f-97ab-7c747a1eaced"}, "from": null}', '2026-10-19 15:15:58.974+00');
INSERT INTO public.task_events VALUES ('01a154bb-d791-7182-90a4-2810ed4b4719', '01a154bb-d790-756b-92f9-19ba576ccf1c', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "量一下客厅的尺寸", "status": "todo", "parentId": null, "projectId": "01a154bb-d5cf-731f-8392-1200a713b0e4"}, "from": null}', '2026-10-19 15:15:58.99+00');
INSERT INTO public.task_events VALUES ('01a154bb-d7a1-7111-a92c-468c9705bbfa', '01a154bb-d7a0-716d-a7bb-94dc94f55036', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Call the letting agent about Hackney", "status": "todo", "parentId": null, "projectId": "01a154bb-d53e-7454-8c91-ac42cc5ddb29"}, "from": null}', '2026-10-19 15:15:59.007+00');
INSERT INTO public.task_events VALUES ('01a154bb-d7af-72c1-a180-9d379fc6d5a7', '01a154bb-d7ae-7752-9bb7-3616d4886496', '01a154bb-d509-76fa-a037-b00bee4ea923', 'created', '{"to": {"title": "Ask Mira about the payments team", "status": "todo", "parentId": null, "projectId": "01a154bb-d53e-7454-8c91-ac42cc5ddb29"}, "from": null}', '2026-10-19 15:15:59.02+00');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users VALUES ('01a154bb-d508-7291-8bf9-ded08ca881b3', 'lance@example.com', '$argon2id$v=19$m=19456,t=2,p=1$UxBFxxxiZVP07JnQBwtTRw$hJdWSotPv6NznWi5B36kWypUOm60JbAehIHuviJ4Cds', 'Europe/London', '2026-10-19 15:15:58.343+00', 'admin', NULL);


--
-- Data for Name: workspace_members; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.workspace_members VALUES ('01a154bb-d509-76fa-a037-b00bee4ea923', '01a154bb-d508-7291-8bf9-ded08ca881b3', '2026-10-19 15:15:58.343+00');


--
-- PostgreSQL database dump complete
--


