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
  annualIncome: number;
  monthlyIncome: number;
  detectedSalaryDescription: string | null;
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
  annualIncome = signal<number>(0);
  monthlyIncome = signal<number>(0);
  detectedSalaryDescription = signal<string | null>(null);
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
    this.annualIncome.set(this.budgetState.annualIncome());
    this.monthlyIncome.set(this.budgetState.monthlyIncome());
    this.detectedSalaryDescription.set(this.budgetState.detectedSalaryDescription());
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
      this.uploadError.set('Please choose an XLSX, XLS, TXT, or CSV statement.');
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
    this.annualIncome.set(0);
    this.monthlyIncome.set(0);
    this.detectedSalaryDescription.set(null);
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
    const supportedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/plain',
      'text/csv'
    ];
    const supportedExtensions = ['.xlsx', '.xls', '.txt', '.csv'];
    const fileName = file.name.toLowerCase();
    return supportedTypes.includes(file.type) || supportedExtensions.some((extension) => fileName.endsWith(extension));
  }

  fileTypeLabel(file: File | null): string {
    if (!file) {
      return '';
    }

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || file.type.includes('excel') || file.type.includes('spreadsheet')) {
      return 'Excel spreadsheet';
    }
    if (fileName.endsWith('.csv') || file.type === 'text/csv') {
      return 'CSV statement';
    }
    if (fileName.endsWith('.txt') || file.type === 'text/plain') {
      return 'Text statement';
    }
    return 'Document statement';
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
      let parsedStatement: ParsedStatement;
      if (this.isExcelStatement(file)) {
        parsedStatement = await this.parseExcelStatement(file);
      } else if (this.isTextStatement(file)) {
        parsedStatement = this.categorizeStatement(await file.text());
      } else {
        this.uploadError.set('Unsupported file format. Please upload an XLSX, XLS, TXT, or CSV file.');
        return;
      }

      if (requestId !== this.statementRequestId) {
        return;
      }

      this.income.set(parsedStatement.income);
      this.annualIncome.set(parsedStatement.annualIncome);
      this.monthlyIncome.set(parsedStatement.monthlyIncome);
      this.detectedSalaryDescription.set(parsedStatement.detectedSalaryDescription);
      this.totalDebits.set(parsedStatement.totalDebits);
      this.closingBalance.set(parsedStatement.closingBalance);
      this.categories.set(parsedStatement.categories);
      this.monthlyExpenses.set(parsedStatement.monthlyExpenses);
      this.updateBudgetState(parsedStatement);

      if (parsedStatement.categories.length === 0) {
        this.uploadNotice.set('No recognizable transaction rows were found in this statement. Include a description and amount on each row.');
      }
    } catch (error) {
      console.error('Error reading statement', error);
      if (requestId === this.statementRequestId) {
        this.uploadError.set('This statement file could not be read. Please make sure it is a valid XLSX, XLS, TXT, or CSV file.');
      }
    } finally {
      if (requestId === this.statementRequestId) {
        this.isProcessing.set(false);
      }
    }
  }

  private isExcelStatement(file: File): boolean {
    const fileName = file.name.toLowerCase();
    return file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      || file.type === 'application/vnd.ms-excel'
      || fileName.endsWith('.xlsx')
      || fileName.endsWith('.xls');
  }

  private isTextStatement(file: File): boolean {
    const fileName = file.name.toLowerCase();
    return file.type === 'text/plain'
      || file.type === 'text/csv'
      || fileName.endsWith('.txt')
      || fileName.endsWith('.csv');
  }

  private async parseExcelStatement(file: File): Promise<ParsedStatement> {
    const XLSX = await import('xlsx');
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return this.categorizeStatement('');
    }
    const worksheet = workbook.Sheets[firstSheetName];
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    return this.categorizeStatement(csvContent);
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
    const salaryKeywordPattern = /\b(?:salary|sal|payroll|stipend|wages|remuneration|direct deposit|emp deposit|salary credit)\b/i;
    const summary = statementText.match(/Opening\s+Balance\s+Debits\s+Credits\s+Closing\s+Bal\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i);
    const statementEnd = this.extractStatementEnd(statementText);

    interface SalaryEntry {
      amount: number;
      description: string;
      monthId?: string;
    }
    const detectedSalaryEntries: SalaryEntry[] = [];
    let income = 0;
    let totalAllCredits = 0;
    const creditMonthsSeen = new Set<string>();
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

      const hasSalaryKeyword = salaryKeywordPattern.test(line);
      const textWithoutDates = line.replace(datePattern, ' ');
      const rawAmounts = [...textWithoutDates.matchAll(amountPattern)]
        .map((match) => Number(match[1].replaceAll(',', '')))
        .filter((amount) => amount > 0 && amount <= maximumTransactionAmount && Number.isSafeInteger(Math.round(amount * 100)));
      const decimalAmounts = [...textWithoutDates.matchAll(/(?:₹|INR|Rs\.?|\$)?\s*([\d,]+\.\d{2})/g)]
        .map((match) => Number(match[1].replaceAll(',', '')))
        .filter((amount) => amount >= 0 && amount <= maximumTransactionAmount);
      const closing = decimalAmounts.at(-1);
      const delta = closing !== undefined && previousClosingBalance !== null
        ? Math.abs(closing - previousClosingBalance)
        : undefined;

      let amount: number | undefined;
      if (delta && delta > 0 && delta <= maximumTransactionAmount) {
        amount = delta;
      } else if (rawAmounts.length > 0) {
        const filtered = closing !== undefined ? rawAmounts.filter(a => Math.abs(a - closing) > 0.01) : rawAmounts;
        const candidates = filtered.length > 0 ? filtered : rawAmounts;
        amount = hasSalaryKeyword ? Math.max(...candidates) : Math.min(...candidates);
      }

      if (!amount || amount <= 0) {
        continue;
      }

      const isSalaryLine = hasSalaryKeyword || salaryKeywordPattern.test(line);
      const isCredit = isSalaryLine
        || (previousClosingBalance !== null && closing !== undefined && closing > previousClosingBalance)
        || /salary|income|credited|credit|deposit|interest/i.test(line);

      // Category matching: expense categories only apply to DEBIT (spending) transactions
      const category = !isCredit
        ? (categories.find((candidate) => candidate.id !== 'other'
            && candidate.keywords.some((keyword) => line.toLowerCase().includes(keyword)))
            ?? categories.find((candidate) => candidate.id === 'other'))
        : null;

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
            description: textWithoutDates.replace(amountPattern, '').replace(/\s+/g, ' ').trim(),
            amount,
            type: 'credit',
            category: 'Income',
            closingBalance: closing ?? null,
          });
        }
      }

      if (isCredit) {
        income += amount;
        totalAllCredits += amount;
        if (month) {
          creditMonthsSeen.add(month.id);
        }

        if (isSalaryLine) {
          const descClean = textWithoutDates.replace(amountPattern, '').replace(/[\/.-]/g, ' ').replace(/\s+/g, ' ').trim();
          detectedSalaryEntries.push({
            amount,
            description: descClean || 'Income Credit',
            monthId: month?.id
          });
        }
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

      // ONLY DEBIT (SPENDING) TRANSACTIONS GO INTO EXPENSE CATEGORIES
      if (!isCredit && category) {
        category.items.push({
          id: `${category.id}-${category.items.length + 1}`,
          name: textWithoutDates.replace(amountPattern, '').replace(/\s+/g, ' ').trim(),
          amount,
        });

        if (month) {
          const currentMonth = monthlyTotals.get(month.id);
          currentMonth?.transactions.push({
            id: `${month.id}-${currentMonth.transactions.length + 1}`,
            date: line.match(/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/)?.[0] ?? month.label,
            description: textWithoutDates.replace(amountPattern, '').replace(/\s+/g, ' ').trim(),
            amount,
            type: 'debit',
            category: category.name,
            closingBalance: closing ?? null,
          });
        }
      }
    }

    let finalMonthlyIncome = 0;
    let finalAnnualIncome = 0;
    let salaryNoticeText: string | null = null;

    if (detectedSalaryEntries.length > 0) {
      const monthSalaryMap = new Map<string, number>();
      let totalSalarySum = 0;

      for (const entry of detectedSalaryEntries) {
        totalSalarySum += entry.amount;
        if (entry.monthId) {
          const current = monthSalaryMap.get(entry.monthId) ?? 0;
          monthSalaryMap.set(entry.monthId, current + entry.amount);
        }
      }

      const distinctMonths = monthSalaryMap.size;
      if (distinctMonths > 0) {
        const monthlySumList = [...monthSalaryMap.values()];
        finalMonthlyIncome = Math.round(monthlySumList.reduce((a, b) => a + b, 0) / distinctMonths);
      } else {
        finalMonthlyIncome = Math.round(totalSalarySum / detectedSalaryEntries.length);
      }

      finalAnnualIncome = finalMonthlyIncome * 12;
      const primaryEntry = detectedSalaryEntries[0];
      salaryNoticeText = `Income detected: "${primaryEntry.description}"`;
    } else if (totalAllCredits > 0) {
      const distinctCreditMonths = creditMonthsSeen.size || 1;
      finalMonthlyIncome = Math.round(totalAllCredits / distinctCreditMonths);
      finalAnnualIncome = finalMonthlyIncome * 12;
      salaryNoticeText = 'Calculated from credits';
    } else if (summary && summary[3]) {
      const summaryIncome = this.parseAmount(summary[3]);
      finalMonthlyIncome = summaryIncome;
      finalAnnualIncome = summaryIncome * 12;
      salaryNoticeText = 'Calculated from statement summary';
    }

    return {
      income: finalMonthlyIncome,
      annualIncome: finalAnnualIncome,
      monthlyIncome: finalMonthlyIncome,
      detectedSalaryDescription: salaryNoticeText,
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
    this.budgetState.annualIncome.set(parsedStatement.annualIncome);
    this.budgetState.monthlyIncome.set(parsedStatement.monthlyIncome);
    this.budgetState.detectedSalaryDescription.set(parsedStatement.detectedSalaryDescription);
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
    const activeIncome = this.monthlyIncome() || this.income();
    return activeIncome > 0 ? Math.min((this.trackedSpending() / activeIncome) * 100, 100) : 0;
  }

  monthlySpendingPercentage(month: MonthlyExpense): number {
    const highestMonthlyTotal = Math.max(...this.monthlyExpenses().map((entry) => entry.total), 0);
    return highestMonthlyTotal > 0 ? (month.total / highestMonthlyTotal) * 100 : 0;
  }

}
