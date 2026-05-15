export const noticeMessages: string[] = [];

export class Plugin {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_app?: unknown) {}

  addCommand(): void {
    return;
  }

  addRibbonIcon(): { remove: () => void } {
    return { remove: () => void 0 };
  }
}

export class Notice {
  constructor(_message: string) {
    noticeMessages.push(_message);
  }
}
