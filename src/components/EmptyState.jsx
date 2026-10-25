import { SearchX } from 'lucide-react';
export function EmptyState({ title, description, action, onAction }) {
  return <div className="empty-state"><SearchX size={32} /><h2>{title}</h2><p>{description}</p>{action && <button className="secondary-button" onClick={onAction}>{action}</button>}</div>;
}
