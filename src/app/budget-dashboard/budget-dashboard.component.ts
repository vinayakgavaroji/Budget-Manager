import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BudgetStateService } from '../budget-state.service';

interface ExpenseItem {
  id: string;
  name: string;
  amount: number;
}

interface ExpenseCategory {
  id: string;
  name: string;
  items: ExpenseItem[];
}

interface ParseStatementResponse {
  payload: {
    income: number;
    categories: ExpenseCategory[];
  };
}

interface ParsedStatement {
  income: number;
  totalDebits: number;
  closingBalance: number;
  categories: ExpenseCategory[];
  monthlyExpenses: MonthlyExpense[];
}

interface MonthlyExpense {
  id: string;
  label: string;
  total: number;
  credits: number;
  closingBalance: number | null;
  transactions: StatementTransaction[];
}

interface StatementTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
  closingBalance: number | null;
}

@Component({
  selector: 'app-budget-dashboard',
  imports: [CommonModule],
  templateUrl: './budget-dashboard.component.html',
  styleUrl: './budget-dashboard.component.scss'
})
export class BudgetDashboardComponent implements OnDestroy, OnInit {

  // Reactive state using Signals
  income = signal<number>(0);
  totalDebits = signal<number>(0);
  closingBalance = signal<number>(0);
  categories = signal<ExpenseCategory[]>([]);
  monthlyExpenses = signal<MonthlyExpense[]>([]);
  isProcessing = signal<boolean>(false);
  selectedFile = signal<File | null>(null);
  previewUrl = signal<string | null>(null);
  uploadError = signal<string | null>(null);
  uploadNotice = signal<string | null>(null);
  selectedMonth = signal<MonthlyExpense | null>(null);
  selectedCategory = signal<string | null>(null);
  selectedCategoryMonth = signal('all');

  private statementRequestId = 0;
  private readonly router = inject(Router);
  private readonly budgetState = inject(BudgetStateService);

  ngOnInit() {
    this.selectedFile.set(this.budgetState.selectedFile());
    this.previewUrl.set(this.budgetState.previewUrl());
    this.income.set(this.budgetState.income());
    this.totalDebits.set(this.budgetState.totalDebits());
    this.closingBalance.set(this.budgetState.closingBalance());
    this.categories.set(this.budgetState.categories());
    this.monthlyExpenses.set(this.budgetState.months());
  }


  onFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.uploadError.set(null);
    this.uploadNotice.set(null);

    if (!this.isSupportedStatement(file)) {
      this.uploadError.set('Please choose a PNG, JPG, PDF, TXT, or CSV statement.');
      input.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.uploadError.set('That file is larger than 10 MB. Please choose a smaller statement.');
      input.value = '';
      return;
    }

    this.resetStatementData();
    this.setSelectedFile(file);
    this.processStatement(file);
  }

  clearSelection(input: HTMLInputElement) {
    this.revokePreviewUrl();
    this.selectedFile.set(null);
    this.resetStatementData();
    this.budgetState.clearFile();
    this.budgetState.reset();
    input.value = '';
  }

  private resetStatementData() {
    this.statementRequestId += 1;
    this.income.set(0);
    this.totalDebits.set(0);
    this.closingBalance.set(0);
    this.categories.set([]);
    this.monthlyExpenses.set([]);
    this.selectedMonth.set(null);
    this.selectedCategory.set(null);
    this.selectedCategoryMonth.set('all');
    this.isProcessing.set(false);
    this.uploadError.set(null);
    this.uploadNotice.set(null);
  }

  private setSelectedFile(file: File) {
    this.revokePreviewUrl();
    this.budgetState.setFile(file);
    this.selectedFile.set(file);
    this.previewUrl.set(this.budgetState.previewUrl());
  }

  private isSupportedStatement(file: File): boolean {
    const supportedTypes = ['image/png', 'image/jpeg', 'application/pdf', 'text/plain', 'text/csv', 'application/vnd.ms-excel'];
    const supportedExtensions = ['.png', '.jpg', '.jpeg', '.pdf', '.txt', '.csv'];
    const fileName = file.name.toLowerCase();
    return supportedTypes.includes(file.type) || supportedExtensions.some((extension) => fileName.endsWith(extension));
  }

  fileTypeLabel(file: File | null): string {
    if (!file) {
      return '';
    }

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.csv') || file.type === 'text/csv') {
      return 'CSV statement';
    }
    if (fileName.endsWith('.txt') || file.type === 'text/plain') {
      return 'Text statement';
    }
    if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
      return 'PDF document';
    }
    return 'Image statement';
  }

  private revokePreviewUrl() {
    const currentPreviewUrl = this.previewUrl();
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      this.previewUrl.set(null);
    }
  }

  async processStatement(file: File) {
    this.isProcessing.set(true);
    const requestId = ++this.statementRequestId;

    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const parsedStatement = await this.parsePdfStatement(file);
        if (requestId !== this.statementRequestId) {
          return;
        }

        this.income.set(parsedStatement.income);
        this.totalDebits.set(parsedStatement.totalDebits);
        this.closingBalance.set(parsedStatement.closingBalance);
        this.categories.set(parsedStatement.categories);
        this.monthlyExpenses.set(parsedStatement.monthlyExpenses);
        this.updateBudgetState(parsedStatement);
        if (parsedStatement.categories.length === 0) {
          this.uploadNotice.set('This PDF has no readable transaction text. Scanned statements need OCR before they can be categorised.');
        }
      } else if (this.isTextStatement(file)) {
        const parsedStatement = this.categorizeStatement(await file.text());
        if (requestId !== this.statementRequestId) {
          return;
        }

        this.income.set(parsedStatement.income);
        this.totalDebits.set(parsedStatement.totalDebits);
        this.closingBalance.set(parsedStatement.closingBalance);
        this.categories.set(parsedStatement.categories);
        this.monthlyExpenses.set(parsedStatement.monthlyExpenses);
        this.updateBudgetState(parsedStatement);
        if (parsedStatement.categories.length === 0) {
          this.uploadNotice.set('No recognizable transaction rows were found in this text file. Include a description and amount on each row.');
        }
      } else {
        this.uploadNotice.set('Image preview is ready. Image statements need OCR before transactions can be categorised.');
      }
    } catch (error) {
      console.error('Error reading statement', error);
      if (requestId === this.statementRequestId) {
        this.uploadError.set('This PDF could not be read. Please try a text-based PDF statement.');
      }
    } finally {
      if (requestId === this.statementRequestId) {
        this.isProcessing.set(false);
      }
    }
  }

  private isTextStatement(file: File): boolean {
    const fileName = file.name.toLowerCase();
    return file.type === 'text/plain'
      || file.type === 'text/csv'
      || file.type === 'application/vnd.ms-excel'
      || fileName.endsWith('.txt')
      || fileName.endsWith('.csv');
  }

  private async parsePdfStatement(file: File): Promise<ParsedStatement> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await pdfjs.getDocument({
      data: await file.arrayBuffer(),
      disableWorker: true,
    } as Parameters<typeof pdfjs.getDocument>[0]).promise;
    const pageText: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const textItems = content.items.filter(
        (item): item is typeof item & { str: string; transform: readonly number[] } => 'str' in item && 'transform' in item,
      );
      const lines: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];

      for (const item of textItems) {
        const y = item.transform[5];
        let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2);
        if (!line) {
          line = { y, items: [] };
          lines.push(line);
        }
        line.items.push({ x: item.transform[4], text: item.str });
      }

      pageText.push(
        lines
          .sort((first, second) => second.y - first.y)
          .map((line) => line.items.sort((first, second) => first.x - second.x).map((item) => item.text).join(' '))
          .join('\n'),
      );
    }

    return this.categorizeStatement(pageText.join('\n'), true);
  }

  private categorizeStatement(statementText: string, requireDate = false): ParsedStatement {
    const categoryRules: Array<{ id: string; name: string; keywords: string[] }> = [
      { id: 'housing', name: 'Home & utilities', keywords: ['rent', 'electric', 'water', 'internet', 'utility', 'airtel', 'telecom', 'jio prepaid'] },
      { id: 'food', name: 'Food & dining', keywords: ['grocery', 'restaurant', 'food', 'swiggy', 'zomato', 'cafe', 'coffee', 'fruit', 'chicken', 'bakery', 'hotel', 'dosa', 'juice', 'beverage', 'panipuri', 'kitchen', 'milk', 'annapoorna'] },
      { id: 'transport', name: 'Transport', keywords: ['fuel', 'uber', 'ola', 'metro', 'transport', 'petrol', 'atw', 'nwd', 'eaw', 'bus', 'travel', 'fastag', 'mobility'] },
      { id: 'shopping', name: 'Shopping', keywords: ['amazon', 'flipkart', 'shopping', 'mall', 'store', 'loyal world', 'more-', 'bookmyshow', 'foot ware', 'fashion'] },
      { id: 'wellness', name: 'Health & wellness', keywords: ['medical', 'medicine', 'pharmacy', 'hospital', 'gym', 'health'] },
      { id: 'investments', name: 'Investments & transfers', keywords: ['groww', 'zerodha', 'mutualfund', 'indian clearing', 'add money to wallet'] },
      { id: 'other', name: 'Other expenses', keywords: [] },
    ];
    const categories = categoryRules.map((rule) => ({ ...rule, items: [] as ExpenseItem[] }));
    const monthlyTotals = new Map<string, MonthlyExpense>();
    const amountPattern = /(?:₹|INR|Rs\.?|\$)?\s*([\d,]+(?:\.\d{1,2})?)(?![\d])/g;
    const datePattern = /\b(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}|(?:\d{1,2}[\s-]+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:[,\s-]+)(?:\d{1,2}[,\s-]+)?\d{2,4})\b/gi;
    const maximumTransactionAmount = 100_000_000;
    const summary = statementText.match(/Opening\s+Balance\s+Debits\s+Credits\s+Closing\s+Bal\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i);
    const statementEnd = this.extractStatementEnd(statementText);
    let income = 0;
    let previousClosingBalance = summary ? this.parseAmount(summary[1]) : null;

    for (const line of this.buildStatementRows(statementText)) {
      if (!line) {
        continue;
      }

      const month = this.extractMonth(line);
      if (requireDate && !month) {
        continue;
      }
      if (month && statementEnd && month.id > statementEnd) {
        continue;
      }

      const transactionText = line.replace(datePattern, ' ');
      const amounts = [...transactionText.matchAll(amountPattern)]
        .map((match) => Number(match[1].replaceAll(',', '')))
        .filter((amount) => amount > 0 && amount <= maximumTransactionAmount && Number.isSafeInteger(Math.round(amount * 100)));
      const decimalAmounts = [...transactionText.matchAll(/(?:₹|INR|Rs\.?|\$)?\s*([\d,]+\.\d{2})/g)]
        .map((match) => Number(match[1].replaceAll(',', '')))
        .filter((amount) => amount >= 0 && amount <= maximumTransactionAmount);
      const closing = decimalAmounts.at(-1);
      const delta = closing !== undefined && previousClosingBalance !== null
        ? Math.abs(closing - previousClosingBalance)
        : undefined;
      const amount = delta && delta <= maximumTransactionAmount ? delta : amounts.length > 0 ? Math.min(...amounts) : undefined;
      if (!amount) {
        continue;
      }

      const isCredit = previousClosingBalance !== null && closing !== undefined
        ? closing > previousClosingBalance
        : /salary|income|credited|credit|deposit|interest/i.test(line);
      const category = categories.find((candidate) => candidate.id !== 'other'
        && candidate.keywords.some((keyword) => line.toLowerCase().includes(keyword)))
        ?? categories.find((candidate) => candidate.id === 'other');
      if (closing !== undefined) {
        previousClosingBalance = closing;
      }

      if (month) {
        const currentMonth = monthlyTotals.get(month.id) ?? {
          id: month.id,
          label: month.label,
          total: 0,
          credits: 0,
          closingBalance: null,
          transactions: [],
        };
        currentMonth.closingBalance = closing ?? currentMonth.closingBalance;
        monthlyTotals.set(month.id, currentMonth);

        if (isCredit) {
          currentMonth.credits += amount;
          currentMonth.transactions.push({
            id: `${month.id}-${currentMonth.transactions.length + 1}`,
            date: line.match(/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/)?.[0] ?? month.label,
            description: transactionText.replace(amountPattern, '').replace(/\s+/g, ' ').trim(),
            amount,
            type: 'credit',
            category: category?.name ?? 'Other expenses',
            closingBalance: closing ?? null,
          });
        }
      }

      if (isCredit) {
        income += amount;
      }

      if (!isCredit && month) {
        const currentMonth = monthlyTotals.get(month.id);
        monthlyTotals.set(month.id, {
          id: month.id,
          label: month.label,
          total: (currentMonth?.total ?? 0) + amount,
          credits: currentMonth?.credits ?? 0,
          closingBalance: closing ?? currentMonth?.closingBalance ?? null,
          transactions: currentMonth?.transactions ?? [],
        });
      }

      if (category && !isCredit) {
        category.items.push({
          id: `${category.id}-${category.items.length + 1}`,
          name: transactionText.replace(amountPattern, '').replace(/\s+/g, ' ').trim(),
          amount,
        });

        if (month) {
          const currentMonth = monthlyTotals.get(month.id);
          currentMonth?.transactions.push({
            id: `${month.id}-${currentMonth.transactions.length + 1}`,
            date: line.match(/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/)?.[0] ?? month.label,
            description: transactionText.replace(amountPattern, '').replace(/\s+/g, ' ').trim(),
            amount,
            type: 'debit',
            category: category.name,
            closingBalance: closing ?? null,
          });
        }
      }
    }

    return {
      income: summary ? this.parseAmount(summary[3]) : income,
      totalDebits: summary ? this.parseAmount(summary[2]) : categories.reduce(
        (total, category) => total + category.items.reduce((categoryTotal, item) => categoryTotal + item.amount, 0),
        0,
      ),
      closingBalance: summary ? this.parseAmount(summary[4]) : 0,
      categories: categories
        .filter((category) => category.items.length > 0)
        .map(({ id, name, items }) => ({ id, name, items })),
      monthlyExpenses: [...monthlyTotals.values()].sort((first, second) => first.id.localeCompare(second.id)),
    };
  }

  private buildStatementRows(statementText: string): string[] {
    const rows: string[] = [];
    let currentRow = '';
    const transactionStart = /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/;
    const ignoredLine = /^(?:HDFC BANK|Page No|Account Branch|Address|MR\.|C\/O:|City|State|Phone no|ROAD JAMKHANDI|KARNATAKA|OD Limit|Cust ID|JOINT HOLDERS|Account No|A\/C Open Date|Nomination|Account Status|Statement From|RTGS\/NEFT|Branch Code|Account Type|Date\s+Narration|[-*]+|\*\*Continue|STATEMENT SUMMARY|Opening Balance|Dr Count|Generated On|Generated By|Requesting Branch|This is a computer|HDFC BANK LIMITED|Closing balance|State account|Registered Office|Contents of this)/i;

    for (const rawLine of statementText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      if (line.startsWith('---  End Of Statement')) {
        break;
      }
      if (ignoredLine.test(line)) {
        if (/STATEMENT SUMMARY|Generated On|This is a computer/i.test(line)) {
          currentRow = '';
        }
        continue;
      }
      if (transactionStart.test(line)) {
        if (currentRow) {
          rows.push(currentRow);
        }
        currentRow = line;
      } else if (currentRow) {
        currentRow += ` ${line}`;
      }
    }

    if (currentRow) {
      rows.push(currentRow);
    }
    return rows;
  }

  private parseAmount(value: string): number {
    return Number(value.replaceAll(',', ''));
  }

  private extractStatementEnd(statementText: string): string | null {
    const statementRange = statementText.match(/Statement\s+From\s*:\s*\d{1,2}[\/.-]\d{1,2}[\/.-](\d{2,4})\s+To\s*:\s*\d{1,2}[\/.-](\d{1,2})[\/.-](\d{2,4})/i);
    if (!statementRange) {
      return null;
    }

    let year = Number(statementRange[3]);
    if (year < 100) {
      year += 2000;
    }
    return `${year}-${String(Number(statementRange[2])).padStart(2, '0')}`;
  }

  private extractMonth(line: string): MonthlyExpense | null {
    const numericDate = line.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b|\b(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/);
    let month: number | undefined;
    let year: number | undefined;

    if (numericDate) {
      if (numericDate[4]) {
        year = Number(numericDate[4]);
        month = Number(numericDate[5]);
      } else {
        year = Number(numericDate[3]);
        month = Number(numericDate[2]);
      }
    } else {
      const namedDate = line.match(/\b(?:\d{1,2}[\s-]+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:[,\s-]+)(?:\d{1,2}[,\s-]+)?(\d{2,4})\b/i);
      if (namedDate) {
        const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        month = monthNames.indexOf(namedDate[1].slice(0, 3).toLowerCase()) + 1;
        year = Number(namedDate[2]);
      }
    }

    if (!month || !year || month < 1 || month > 12) {
      return null;
    }

    if (year < 100) {
      year += 2000;
    }

    const date = new Date(Date.UTC(year, month - 1, 1));
    return {
      id: `${year}-${String(month).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date),
      total: 0,
      credits: 0,
      closingBalance: null,
      transactions: [],
    };
  }

  ngOnDestroy() {
    // The shared store owns the preview URL while the file remains selected.
  }

  totalExpenses(): number {
    return this.categories().reduce(
      (total, category) => total + category.items.reduce((categoryTotal, item) => categoryTotal + item.amount, 0),
      0,
    );
  }

  categoryTotal(category: ExpenseCategory): number {
    return category.items.reduce((total, item) => total + item.amount, 0);
  }

  selectMonth(month: MonthlyExpense) {
    this.selectedMonth.set(month);
    this.router.navigate(['/monthly-statement', month.id]);
  }

  selectBreakdownMonth(month: { id: string }) {
    const matchingMonth = this.monthlyExpenses().find((entry) => entry.id === month.id);
    if (matchingMonth) {
      this.selectMonth(matchingMonth);
    }
  }

  closeMonth() {
    this.selectedMonth.set(null);
  }

  selectCategory(categoryName: string) {
    this.selectedCategory.set(categoryName);
    this.selectedCategoryMonth.set(this.selectedMonth()?.id ?? 'all');
    this.router.navigate(['/expense-breakdown'], { queryParams: { category: categoryName } });
  }

  openAnnualBreakdown() {
    this.router.navigate(['/expense-breakdown']);
  }

  private updateBudgetState(parsedStatement: ParsedStatement) {
    this.budgetState.income.set(parsedStatement.income);
    this.budgetState.totalDebits.set(parsedStatement.totalDebits);
    this.budgetState.closingBalance.set(parsedStatement.closingBalance);
    this.budgetState.categories.set(parsedStatement.categories);
    this.budgetState.months.set(parsedStatement.monthlyExpenses);
  }

  closeCategory() {
    this.selectedCategory.set(null);
  }

  selectCategoryMonth(event: Event) {
    this.selectedCategoryMonth.set((event.target as HTMLSelectElement).value);
  }

  selectedCategoryTransactions(): Array<StatementTransaction & { monthLabel: string }> {
    const categoryName = this.selectedCategory();
    if (!categoryName) {
      return [];
    }

    return this.monthlyExpenses()
      .filter((month) => this.selectedCategoryMonth() === 'all' || month.id === this.selectedCategoryMonth())
      .flatMap((month) => month.transactions
      .filter((transaction) => transaction.category === categoryName)
      .map((transaction) => ({ ...transaction, monthLabel: month.label })));
  }

  selectedCategoryExpenseTotal(): number {
    return this.selectedCategoryTransactions()
      .filter((transaction) => transaction.type === 'debit')
      .reduce((total, transaction) => total + transaction.amount, 0);
  }

  displayCategories(): ExpenseCategory[] {
    const month = this.selectedMonth();
    if (!month) {
      return this.categories();
    }

    const categoryMap = new Map<string, ExpenseCategory>();
    for (const transaction of month.transactions.filter((entry) => entry.type === 'debit')) {
      const id = transaction.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const category = categoryMap.get(id) ?? {
        id,
        name: transaction.category,
        items: [],
      };
      category.items.push({
        id: transaction.id,
        name: transaction.description,
        amount: transaction.amount,
      });
      categoryMap.set(id, category);
    }

    return [...categoryMap.values()];
  }

  displaySpendingTotal(): number {
    return this.selectedMonth()?.total ?? this.trackedSpending();
  }

  trackedSpending(): number {
    return this.totalDebits() || this.totalExpenses();
  }

  spendingPercentage(category: ExpenseCategory): number {
    const total = this.trackedSpending();
    return total > 0 ? (this.categoryTotal(category) / total) * 100 : 0;
  }

  budgetUsagePercentage(): number {
    return this.income() > 0 ? Math.min((this.trackedSpending() / this.income()) * 100, 100) : 0;
  }

  monthlySpendingPercentage(month: MonthlyExpense): number {
    const highestMonthlyTotal = Math.max(...this.monthlyExpenses().map((entry) => entry.total), 0);
    return highestMonthlyTotal > 0 ? (month.total / highestMonthlyTotal) * 100 : 0;
  }

}
