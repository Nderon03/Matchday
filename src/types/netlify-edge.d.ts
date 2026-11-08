// Types for the Netlify edge function (netlify/edge-functions), which the unit tests import.
// Netlify runs it on Deno with these provided; this only keeps the app's TypeScript check happy.
declare module 'https://edge.netlify.com' {
  export type Context = { next: () => Promise<Response> };
  export type Config = { path: string | string[]; excludedPath?: string | string[] };
}
declare const Netlify: { env: { get: (key: string) => string | undefined } };
