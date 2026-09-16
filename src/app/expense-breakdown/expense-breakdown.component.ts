import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
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
  private readonly budgetState = inject(BudgetStateService);
  private readonly router = inject(Router);

  ngOnInit() {
    if (this.categories.length === 0) {
      this.categories = this.budgetState.categories();
      this.months = this.budgetState.months();
      this.annualTotal = this.budgetState.totalDebits();
    }
  }

  reset() {
    this.selectedMonth = null;
    this.selectedCategoryName = null;
  }

  displayedCategories(): ExpenseBreakdownCategory[] {
    if (!this.selectedMonth) {
      return this.categories;
    }

    const categoryMap = new Map<string, ExpenseBreakdownCategory>();
    for (const transaction of this.selectedMonth.transactions.filter((item) => item.type === 'debit')) {
      const id = transaction.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const category = categoryMap.get(id) ?? { id, name: transaction.category, items: [] };
      category.items.push({ id: transaction.id, name: transaction.description, amount: transaction.amount });
      categoryMap.set(id, category);
    }
    return [...categoryMap.values()];
  }

  categoryTotal(category: ExpenseBreakdownCategory): number {
    return category.items.reduce((total, item) => total + item.amount, 0);
  }

  selectMonth(month: ExpenseBreakdownMonth) {
    this.selectedMonth = month;
    this.monthSelected.emit(month);
  }

  clearMonth() {
    this.selectedMonth = null;
    this.selectedCategoryName = null;
  }

  selectCategory(categoryName: string) {
    this.selectedCategoryName = categoryName;
    this.categorySelected.emit(categoryName);
  }

  closeCategory() {
    this.selectedCategoryName = null;
  }

  selectedCategoryTransactions() {
    if (!this.selectedCategoryName) {
      return [];
    }

    return this.months
      .filter((month) => !this.selectedMonth || month.id === this.selectedMonth.id)
      .flatMap((month) => month.transactions
        .filter((transaction) => transaction.type === 'debit' && transaction.category === this.selectedCategoryName)
        .map((transaction) => ({ ...transaction, monthLabel: month.label })));
  }

  selectedCategoryTotal(): number {
    return this.selectedCategoryTransactions().reduce((total, transaction) => total + transaction.amount, 0);
  }

  goToDashboard() {
    this.router.navigate(['/budget-dashboard']);
  }
}
