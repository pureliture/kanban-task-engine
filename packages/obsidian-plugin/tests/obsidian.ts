export const noticeMessages: string[] = [];

export class TAbstractFile {
  path = '';
  name = '';
  parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
  stat = {
    ctime: 0,
    mtime: 0,
    size: 0,
  };
  basename = '';
  extension = '';

  constructor(path = '') {
    super();
    this.path = path;
    this.name = path.split('/').pop() ?? path;
    this.extension = this.name.includes('.') ? this.name.split('.').pop() ?? '' : '';
    this.basename = this.extension ? this.name.slice(0, -this.extension.length - 1) : this.name;
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];

  constructor(path = '') {
    super();
    this.path = path;
    this.name = path.split('/').pop() ?? path;
  }

  isRoot(): boolean {
    return this.path === '';
  }
}

export class Plugin {
  app: unknown;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(app?: unknown) {
    this.app = app;
  }

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

class FakeElement {
  textContent = '';
  children: FakeElement[] = [];

  empty(): void {
    this.children = [];
    this.textContent = '';
  }

  createEl(_tag: string, options?: { text?: string; cls?: string }): FakeElement {
    const child = new FakeElement();
    child.textContent = options?.text ?? '';
    this.children.push(child);
    return child;
  }

  createDiv(options?: { text?: string; cls?: string }): FakeElement {
    return this.createEl('div', options);
  }

  setText(text: string): void {
    this.textContent = text;
  }
}

export class Modal {
  app: unknown;
  contentEl = new FakeElement() as unknown as HTMLElement;
  titleEl = new FakeElement() as unknown as HTMLElement;
  closed = false;
  opened = false;

  constructor(app: unknown) {
    this.app = app;
  }

  open(): void {
    this.opened = true;
    this.onOpen();
  }

  close(): void {
    this.closed = true;
    this.onClose();
  }

  onOpen(): void {
    return;
  }

  onClose(): void {
    return;
  }
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}

  setName(): this {
    return this;
  }

  setDesc(): this {
    return this;
  }

  setDisabled(): this {
    return this;
  }

  addText(cb: (component: TextComponent) => unknown): this {
    cb(new TextComponent());
    return this;
  }

  addToggle(cb: (component: ToggleComponent) => unknown): this {
    cb(new ToggleComponent());
    return this;
  }

  addDropdown(cb: (component: DropdownComponent) => unknown): this {
    cb(new DropdownComponent());
    return this;
  }

  addButton(cb: (component: ButtonComponent) => unknown): this {
    cb(new ButtonComponent());
    return this;
  }
}

export class TextComponent {
  value = '';

  setValue(value: string): this {
    this.value = value;
    return this;
  }

  getValue(): string {
    return this.value;
  }

  setPlaceholder(): this {
    return this;
  }

  onChange(): this {
    return this;
  }
}

export class ToggleComponent {
  value = false;

  setValue(value: boolean): this {
    this.value = value;
    return this;
  }

  onChange(): this {
    return this;
  }
}

export class DropdownComponent {
  value = '';

  addOption(): this {
    return this;
  }

  setValue(value: string): this {
    this.value = value;
    return this;
  }

  onChange(): this {
    return this;
  }
}

export class ButtonComponent {
  disabled = false;

  setButtonText(): this {
    return this;
  }

  setCta(): this {
    return this;
  }

  setWarning(): this {
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    return this;
  }

  onClick(): this {
    return this;
  }
}
