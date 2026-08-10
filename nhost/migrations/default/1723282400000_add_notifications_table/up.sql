CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_run_id uuid NOT NULL,
    channel text NOT NULL,
    message text NOT NULL,
    recipient text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_workflow_run_id_fkey FOREIGN KEY (workflow_run_id) REFERENCES public.workflow_runs(id) ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE public.notifications OWNER TO nhost_hasura;
