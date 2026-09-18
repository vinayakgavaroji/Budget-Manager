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

  updateNumberFilter(field: 'minimumAmount' | 'maximumAmount' | 'minimumBalance' | 'maximumBalance', event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this[field] = value === '' ? null : Number(value);
  }

  updateTransactionType(event: Event) {
    this.transactionType = (event.target as HTMLSelectElement).value as 'all' | 'debit' | 'credit';
  }

  updateCategoryFilter(event: Event) {
    this.selectedCategory = (event.target as HTMLSelectElement).value;
  }

  selectCategory(categoryName: string) {
    this.selectedCategory = categoryName;
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

  resetFilters() {
    this.transactionType = 'all';
    this.selectedCategory = 'all';
    this.minimumAmount = null;
    this.maximumAmount = null;
    this.minimumBalance = null;
    this.maximumBalance = null;
  }

  goToDashboard() {
    this.router.navigate(['/budget-dashboard']);
  }
}
