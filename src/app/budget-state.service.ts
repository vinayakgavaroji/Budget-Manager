import { Injectable, signal } from '@angular/core';

export interface BudgetTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
  closingBalance: number | null;
}

export interface BudgetCategory {
  id: string;
  name: string;
  items: Array<{ id: string; name: string; amount: number }>;
}

export interface BudgetMonth {
  id: string;
  label: string;
  total: number;
  credits: number;
  closingBalance: number | null;
  transactions: BudgetTransaction[];
}

@Injectable({ providedIn: 'root' })
export class BudgetStateService {
  readonly income = signal(0);
  readonly totalDebits = signal(0);
  readonly closingBalance = signal(0);
  readonly categories = signal<BudgetCategory[]>([]);
  readonly months = signal<BudgetMonth[]>([]);
  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);

  setFile(file: File) {
    this.revokePreview();
    this.selectedFile.set(file);
    this.previewUrl.set(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  }

  clearFile() {
    this.revokePreview();
    this.selectedFile.set(null);
  }

  reset() {
    this.income.set(0);
    this.totalDebits.set(0);
    this.closingBalance.set(0);
    this.categories.set([]);
    this.months.set([]);
  }

  private revokePreview() {
    const currentPreviewUrl = this.previewUrl();
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      this.previewUrl.set(null);
    }
  }
}
