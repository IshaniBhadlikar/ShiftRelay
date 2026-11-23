import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui'
import { APP_NAME } from '../constants'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <title>{`Not found · ${APP_NAME}`}</title>
      <meta name="robots" content="noindex" />
      <p className="mb-3 font-mono text-sm tabular-nums text-muted-foreground">404</p>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="mb-8 text-muted-foreground">This page isn&apos;t on the board.</p>
      {/* Same shape as every other primary action: the kit's Button styles (theme radius, not a pill). */}
      <Link to="/home" className={buttonVariants()}>
        Go home
      </Link>
    </div>
  )
}
