import { createAppContainer } from '@app';
import { renderErrorView, renderStatusView } from './status-view';
import './styles.css';

const rootElement = document.querySelector<HTMLElement>('#app');
if (rootElement === null) {
  throw new Error('Side panel root element #app is missing');
}
const root: HTMLElement = rootElement;

const container = createAppContainer();

async function refresh(): Promise<void> {
  try {
    renderStatusView(root, await container.loadWorkspaceStatus(), { onRefresh: refresh });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderErrorView(root, message, { onRefresh: refresh });
  }
}

void refresh();
