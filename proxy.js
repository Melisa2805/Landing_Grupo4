import { clerkMiddleware } from '@clerk/nextjs/server'

// Makes the Clerk session available to auth(). Access is enforced inside each
// route handler, next to the resource; the practice page shows its own sign-in.
export default clerkMiddleware()

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
}
