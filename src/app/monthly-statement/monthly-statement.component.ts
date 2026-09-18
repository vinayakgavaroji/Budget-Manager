import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { BudgetStateService } from '../budget-state.service';

export interface MonthlyStatementTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
  closingBalance: number | null;
}

export interface MonthlyStatementData {
  id: string;
  label: string;
  total: number;
  credits: number;
  closingBalance: number | null;
  transactions: MonthlyStatementTransaction[];
}

@Component({
  selector: 'app-monthly-statement',
  imports: [CommonModule],
  templateUrl: './monthly-statement.component.html',
  styleUrl: './monthly-statement.component.scss',
})
export class MonthlyStatementComponent implements OnInit {
  @Input() month: MonthlyStatementData | null = null;
  @Output() closed = new EventEmitter<void>();

  transactionType: 'all' | 'debit' | 'credit' = 'all';
  selectedCategory: string = 'all';
  minimumAmount: number | null = null;
  maximumAmount: number | null = null;
  minimumBalance: number | null = null;
  maximumBalance: number | null = null;
  private readonly budgetState = inject(BudgetStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit() {
    if (!this.month) {
      const monthId = this.route.snapshot.paramMap.get('monthId');
      this.month = this.budgetState.months().find((entry) => entry.id === monthId) ?? null;
    }
  }

  closingBalance(): number | null {
    return this.month?.transactions.at(-1)?.closingBalance ?? this.month?.closingBalance ?? null;
  }

  availableCategories(): string[] {
    const categoriesSet = new Set<string>();
    for (const transaction of this.month?.transactions ?? []) {
      if (transaction.category) {
        categoriesSet.add(transaction.category);
      }
    }
    return Array.from(categoriesSet).sort();
  }

  filteredTransactions(): MonthlyStatementTransaction[] {
    return (this.month?.transactions ?? []).filter((transaction) => {
      const matchesType = this.transactionType === 'all' || transaction.type === this.transactionType;
      const matchesCategory = this.selectedCategory === 'all' || transaction.category === this.selectedCategory;
      const matchesAmount = (this.minimumAmount === null || transaction.amount >= this.minimumAmount)
        && (this.maximumAmount === null || transaction.amount <= this.maximumAmount);
      const balance = transaction.closingBalance;
      const matchesBalance = balance !== null
        && (this.minimumBalance === null || balance >= this.minimumBalance)
        && (this.maximumBalance === null || balance <= this.maximumBalance);

      return matchesType && matchesCategory && matchesAmount && (this.minimumBalance === null && this.maximumBalance === null ? true : matchesBalance);
    });
  }

  currentPage = 1;
  pageSize = 10;
  pageSizeOptions: number[] = [5, 10, 20, 50, 100];

  updateNumberFilter(field: 'minimumAmount' | 'maximumAmount' | 'minimumBalance' | 'maximumBalance', event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this[field] = value === '' ? null : Number(value);
    this.currentPage = 1;
  }

  updateTransactionType(event: Event) {
    this.transactionType = (event.target as HTMLSelectElement).value as 'all' | 'debit' | 'credit';
    this.currentPage = 1;
  }

  updateCategoryFilter(event: Event) {
    this.selectedCategory = (event.target as HTMLSelectElement).value;
    this.currentPage = 1;
  }

  selectCategory(categoryName: string) {
    this.selectedCategory = categoryName;
    this.currentPage = 1;
  }

  categoryIcon(categoryName: string): string {
    const name = categoryName.toLowerCase();
    if (name.includes('home') || name.includes('utility') || name.includes('utilities')) return '🏠';
    if (name.includes('food') || name.includes('dining')) return '🍔';
    if (name.includes('transport') || name.includes('travel')) return '🚗';
    if (name.includes('shop') || name.includes('shopping')) return '🛍️';
    if (name.includes('health') || name.includes('wellness') || name.includes('medical')) return '🏥';
    if (name.includes('invest') || name.includes('transfer')) return '📈';
    if (name.includes('income') || name.includes('salary') || name.includes('credit')) return '💰';
    return '📦';
  }

  categoryBreakdown(): Array<{ name: string; amount: number; count: number }> {
    const map = new Map<string, { amount: number; count: number }>();
    for (const t of this.filteredTransactions()) {
      const entry = map.get(t.category) ?? { amount: 0, count: 0 };
      entry.amount += t.amount;
      entry.count++;
      map.set(t.category, entry);
    }
    return Array.from(map.entries())
      .map(([name, val]) => ({ name, ...val }))
      .sort((a, b) => b.amount - a.amount);
  }

  totalFilteredAmount(): number {
    return this.filteredTransactions().reduce((s, t) => s + t.amount, 0);
  }

  selectedCategoryBreakdown: string | null = null;

  selectCategoryFromBreakdown(name: string) {
    if (this.selectedCategory === name) {
      this.selectCategory('all');
      this.selectedCategoryBreakdown = null;
    } else {
      this.selectCategory(name);
      this.selectedCategoryBreakdown = name;
    }
  }

  resetFilters() {
    this.transactionType = 'all';
    this.selectedCategory = 'all';
    this.minimumAmount = null;
    this.maximumAmount = null;
    this.minimumBalance = null;
    this.maximumBalance = null;
    this.currentPage = 1;
  }

  paginatedTransactions(): MonthlyStatementTransaction[] {
    const filtered = this.filteredTransactions();
    const start = (this.currentPage - 1) * this.pageSize;
    return filtered.slice(start, start + this.pageSize);
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredTransactions().length / this.pageSize));
  }

  startIndex(): number {
    const total = this.filteredTransactions().length;
    if (total === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  endIndex(): number {
    const total = this.filteredTransactions().length;
    return Math.min(this.currentPage * this.pageSize, total);
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage = page;
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages()) {
      this.currentPage++;
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  firstPage() {
    this.currentPage = 1;
  }

  lastPage() {
    this.currentPage = this.totalPages();
  }

  changePageSize(event: Event) {
    const size = Number((event.target as HTMLSelectElement).value);
    this.pageSize = size;
    this.currentPage = 1;
  }

  pageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage;
    const pages: number[] = [];

    let start = Math.max(1, current - 2);
    let end = Math.min(total, start + 4);
    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  goToDashboard() {
    this.router.navigate(['/budget-dashboard']);
  }
}
