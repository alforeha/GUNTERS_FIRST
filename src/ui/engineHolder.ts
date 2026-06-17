// Non-reactive handle to the live ViewerEngine instance (owned by <Viewport/>).
// UI controls call engine methods through this; the engine never re-renders React.
import type { ViewerEngine } from '../viewer';

export const engineHolder: { current: ViewerEngine | null } = { current: null };
