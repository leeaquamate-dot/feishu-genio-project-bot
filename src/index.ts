import { Env } from './types';
import { handleWebhook } from './webhook';
import { runInspection } from './services/inspection';
import { logHistory } from './storage/d1';

export default {
  // HTTP request handler
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/') {
      return new Response('Feishu Bot is running! 🤖', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // Webhook endpoint - accept both GET (for testing) and POST
    if (url.pathname === '/webhook') {
      if (request.method === 'GET') {
        return new Response('Webhook endpoint ready. POST events here.', {
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      if (request.method === 'POST') {
        return handleWebhook(request, env, ctx);
      }
    }

    // Manual trigger endpoint (for testing)
    if (url.pathname === '/trigger/inspection' && request.method === 'POST') {
      // Simple auth check
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.FEISHU_APP_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }

      ctx.waitUntil(runInspection(env));
      return new Response('Inspection triggered', { status: 200 });
    }

    // 404
    return new Response('Not Found', { status: 404 });
  },

  // Scheduled handler (Cron)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Cron triggered at:', new Date().toISOString());
    ctx.waitUntil(runInspection(env));
  },
};