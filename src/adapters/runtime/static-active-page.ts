import type { ActivePageInfo, ActivePagePort } from '@core';

/** Test double / local preview: returns the page configured by the caller. */
export class StaticActivePageAdapter implements ActivePagePort {
  private page: ActivePageInfo | null;

  constructor(page: ActivePageInfo | null = null) {
    this.page = page;
  }

  setPage(page: ActivePageInfo | null): void {
    this.page = page;
  }

  async read(): Promise<ActivePageInfo | null> {
    return this.page === null ? null : { ...this.page };
  }
}
