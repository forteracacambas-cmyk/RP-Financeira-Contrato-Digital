import { createApi } from '../../api.ts';

const app = createApi();

export const onRequest = (context: { request: Request; env: Parameters<typeof app.fetch>[1] }) => app.fetch(context.request, context.env);
