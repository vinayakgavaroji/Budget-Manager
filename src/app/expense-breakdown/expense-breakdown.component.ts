import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BudgetStateService } from '../budget-state.service';

export interface ExpenseBreakdownItem {
  id: string;
  name: string;
  amount: number;
}

export interface ExpenseBreakdownCategory {
  id: string;
  name: string;
  items: ExpenseBreakdownItem[];
}

export interface ExpenseBreakdownMonth {
  id: string;
  label: string;
  total: number;
  transactions: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    type: 'debit' | 'credit';
    category: string;
    closingBalance: number | null;
  }>;
}

@Component({
  selector: 'app-expense-breakdown',
  imports: [CommonModule],
  templateUrl: './expense-breakdown.component.html',
  styleUrl: './expense-breakdown.component.scss',
})
export class ExpenseBreakdownComponent implements OnInit {
  @Input() categories: ExpenseBreakdownCategory[] = [];
  @Input() months: ExpenseBreakdownMonth[] = [];
  @Input() annualTotal = 0;
  @Output() monthSelected = new EventEmitter<ExpenseBreakdownMonth>();
  @Output() categorySelected = new EventEmitter<string>();

  selectedMonth: ExpenseBreakdownMonth | null = null;
  selectedCategoryName: string | null = null;
  selectedCategoryFilter: string = 'all';
  transactionType: 'all' | 'debit' | 'credit' = 'all';
  minimumAmount: number | null = null;
  maximumAmount: number | null = null;
  minimumBalance: number | null = null;
  maximumBalance: number | null = null;
  private readonly budgetState = inject(BudgetStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit() {
    if (this.categories.length === 0) {
      this.categories = this.budgetState.categories();
      this.months = this.budgetState.months();
      this.annualTotal = this.budgetState.totalDebits();
    }
    const categoryParam = this.route.snapshot.queryParamMap.get('category');
    if (categoryParam) {
      this.selectedCategoryName = categoryParam;
      this.selectedCategoryFilter = categoryParam;
    }
  }

  categoryCurrentPage = 1;
  categoryPageSize = 10;
  categoryPageSizeOptions: number[] = [5, 10, 20, 50, 100];

  reset() {
    this.selectedMonth = null;
    this.selectedCategoryName = null;
    this.selectedCategoryFilter = 'all';
    this.transactionType = 'all';
    this.minimumAmount = null;
    this.maximumAmount = null;
    this.minimumBalance = null;
    this.maximumBalance = null;
    this.categoryCurrentPage = 1;
  }

  updateNumberFilter(field: 'minimumAmount' | 'maximumAmount' | 'minimumBalance' | 'maximumBalance', event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this[field] = value === '' ? null : Number(value);
    this.categoryCurrentPage = 1;
  }

  updateTransactionType(event: Event) {
    this.transactionType = (event.target as HTMLSelectElement).value as 'all' | 'debit' | 'credit';
    this.categoryCurrentPage = 1;
  }

  resetFilters() {
    this.transactionType = 'all';
    this.selectedCategoryFilter = 'all';
    this.minimumAmount = null;
    this.maximumAmount = null;
    this.minimumBalance = null;
    this.maximumBalance = null;
    this.categoryCurrentPage = 1;
  }

  isAdvancedFiltersActive(): boolean {
    return this.transactionType !== 'all' ||
      this.minimumAmount !== null ||
      this.maximumAmount !== null ||
      this.minimumBalance !== null ||
      this.maximumBalance !== null;
  }

  allScopedTransactions() {
    return this.months
      .filter((month) => !this.selectedMonth || month.id === this.selectedMonth.id)
      .flatMap((month) => month.transactions.map((t) => ({ ...t, monthLabel: month.label })));
  }

  filteredTransactions() {
    return this.allScopedTransactions().filter((transaction) => {
      const matchesType = this.transactionType === 'all' || transaction.type === this.transactionType;
      const matchesAmount = (this.minimumAmount === null || transaction.amount >= this.minimumAmount)
        && (this.maximumAmount === null || transaction.amount <= this.maximumAmount);
      const balance = transaction.closingBalance;
      const matchesBalance = balance !== null
        && (this.minimumBalance === null || balance >= this.minimumBalance)
        && (this.maximumBalance === null || balance <= this.maximumBalance);

      return matchesType && matchesAmount && (this.minimumBalance === null && this.maximumBalance === null ? true : matchesBalance);
    });
  }

  displayedCategories(): ExpenseBreakdownCategory[] {
    const filtered = this.filteredTransactions();
    const categoryMap = new Map<string, ExpenseBreakdownCategory>();
    for (const transaction of filtered) {
      if (!transaction.category) continue;
      const id = transaction.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const category = categoryMap.get(id) ?? { id, name: transaction.category, items: [] };
      category.items.push({ id: transaction.id, name: transaction.description, amount: transaction.amount });
      categoryMap.set(id, category);
    }
    return [...categoryMap.values()];
  }

  availableCategoryNames(): string[] {
    const categories = this.displayedCategories();
    return categories.map((cat) => cat.name).sort();
  }

  filteredDisplayedCategories(): ExpenseBreakdownCategory[] {
    const categories = this.displayedCategories();
    if (this.selectedCategoryFilter === 'all') {
      return categories;
    }
    return categories.filter((cat) => cat.name.toLowerCase() === this.selectedCategoryFilter.toLowerCase());
  }

  updateCategoryFilter(event: Event) {
    this.selectedCategoryFilter = (event.target as HTMLSelectElement).value;
    this.categoryCurrentPage = 1;
  }

  selectCategoryFilterPill(categoryName: string) {
    this.selectedCategoryFilter = categoryName;
    this.categoryCurrentPage = 1;
  }

  categoryIcon(categoryName: string): string {
    const name = categoryName.toLowerCase();
    if (name.includes('home') || name.includes('utility') || name.includes('utilities')) return '🏠';
    if (name.includes('food') || name.includes('dining')) return '🍔';
    if (name.includes('transport') || name.includes('travel')) return '🚗';
    if (name.includes('shop') || name.includes('shopping')) return '🛍️';
    if (name.includes('health') || name.includes('wellness') || name.includes('medical')) return '🏥';
    if (name.includes('invest') || name.includes('transfer')) return '📈';
    return '📦';
  }

  categoryTotal(category: ExpenseBreakdownCategory): number {
    return category.items.reduce((total, item) => total + item.amount, 0);
  }

  selectMonth(month: ExpenseBreakdownMonth) {
    this.selectedMonth = month;
    this.categoryCurrentPage = 1;
    this.monthSelected.emit(month);
  }

  clearMonth() {
    this.selectedMonth = null;
    this.selectedCategoryName = null;
    this.selectedCategoryFilter = 'all';
    this.categoryCurrentPage = 1;
  }

  selectCategory(categoryName: string) {
    this.selectedCategoryName = categoryName;
    this.categoryCurrentPage = 1;
    this.categorySelected.emit(categoryName);
  }

  closeCategory() {
    this.selectedCategoryName = null;
    this.categoryCurrentPage = 1;
  }

  selectedCategoryTransactions() {
    if (!this.selectedCategoryName) {
      return [];
    }

    return this.filteredTransactions().filter(
      (transaction) => transaction.category === this.selectedCategoryName
    );
  }

  paginatedCategoryTransactions() {
    const all = this.selectedCategoryTransactions();
    const start = (this.categoryCurrentPage - 1) * this.categoryPageSize;
    return all.slice(start, start + this.categoryPageSize);
  }

  categoryTotalPages(): number {
    return Math.max(1, Math.ceil(this.selectedCategoryTransactions().length / this.categoryPageSize));
  }

  categoryStartIndex(): number {
    const total = this.selectedCategoryTransactions().length;
    if (total === 0) return 0;
    return (this.categoryCurrentPage - 1) * this.categoryPageSize + 1;
  }

  categoryEndIndex(): number {
    const total = this.selectedCategoryTransactions().length;
    return Math.min(this.categoryCurrentPage * this.categoryPageSize, total);
  }

  goToCategoryPage(page: number) {
    if (page >= 1 && page <= this.categoryTotalPages()) {
      this.categoryCurrentPage = page;
    }
  }

  nextCategoryPage() {
    if (this.categoryCurrentPage < this.categoryTotalPages()) {
      this.categoryCurrentPage++;
    }
  }

  previousCategoryPage() {
    if (this.categoryCurrentPage > 1) {
      this.categoryCurrentPage--;
    }
  }

  firstCategoryPage() {
    this.categoryCurrentPage = 1;
  }

  lastCategoryPage() {
    this.categoryCurrentPage = this.categoryTotalPages();
  }

  changeCategoryPageSize(event: Event) {
    const size = Number((event.target as HTMLSelectElement).value);
    this.categoryPageSize = size;
    this.categoryCurrentPage = 1;
  }

  categoryPageNumbers(): number[] {
    const total = this.categoryTotalPages();
    const current = this.categoryCurrentPage;
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

  selectedCategoryTotal(): number {
    return this.selectedCategoryTransactions().reduce((total, transaction) => total + transaction.amount, 0);
  }

  goToDashboard() {
    this.router.navigate(['/budget-dashboard']);
  }
}
