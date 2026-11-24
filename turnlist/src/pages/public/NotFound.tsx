import { Link } from 'react-router-dom';
import { Page } from '@/components/Layout';

export default function NotFound() {
  return (
    <Page narrow>
      <p className="eyebrow">Page not found</p>
      <h1 className="mt-3 text-h1">We could not find that page.</h1>
      <p className="mt-3 text-ink-muted">The link may be old, or the listing may have been removed.</p>
      <div className="mt-8 flex gap-3">
        <Link to="/jobs" className="btn-primary">
          Find Work
        </Link>
        <Link to="/" className="btn-secondary">
          Home
        </Link>
      </div>
    </Page>
  );
}
