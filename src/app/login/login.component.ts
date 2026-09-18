import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  authMode = signal<'signin' | 'signup'>('signin');

  // Sign In fields
  email = '';
  password = '';

  // Sign Up fields
  signUpName = '';
  signUpEmail = '';
  signUpPassword = '';
  signUpConfirmPassword = '';

  showPassword = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  isLoading = signal(false);

  private returnUrl = '/budget-dashboard';

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  ngOnInit() {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/budget-dashboard']);
      return;
    }

    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/budget-dashboard';
  }

  setMode(mode: 'signin' | 'signup') {
    this.authMode.set(mode);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  togglePasswordVisibility() {
    this.showPassword.update(value => !value);
  }

  onSubmitSignIn() {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (!this.email || !this.password) {
      this.errorMessage.set('Please enter both your email address and password.');
      return;
    }

    if (!this.email.includes('@')) {
      this.errorMessage.set('Please enter a valid email address.');
      return;
    }

    this.isLoading.set(true);

    setTimeout(() => {
      const result = this.authService.login(this.email, this.password);
      this.isLoading.set(false);

      if (result.success) {
        this.router.navigateByUrl(this.returnUrl);
      } else {
        this.errorMessage.set(result.message || 'Invalid credentials. Please try again.');
      }
    }, 400);
  }

  onSubmitSignUp() {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (!this.signUpName || !this.signUpEmail || !this.signUpPassword || !this.signUpConfirmPassword) {
      this.errorMessage.set('Please fill in all fields to create your account.');
      return;
    }

    if (!this.signUpEmail.includes('@')) {
      this.errorMessage.set('Please enter a valid email address.');
      return;
    }

    if (this.signUpPassword.length < 4) {
      this.errorMessage.set('Password must be at least 4 characters long.');
      return;
    }

    if (this.signUpPassword !== this.signUpConfirmPassword) {
      this.errorMessage.set('Passwords do not match. Please check and try again.');
      return;
    }

    this.isLoading.set(true);

    setTimeout(() => {
      const result = this.authService.register(
        this.signUpName,
        this.signUpEmail,
        this.signUpPassword
      );
      this.isLoading.set(false);

      if (result.success) {
        this.router.navigateByUrl(this.returnUrl);
      } else {
        this.errorMessage.set(result.message || 'Registration failed. Please try again.');
      }
    }, 400);
  }

  onDemoLogin() {
    this.isLoading.set(true);
    setTimeout(() => {
      this.authService.demoLogin();
      this.isLoading.set(false);
      this.router.navigateByUrl(this.returnUrl);
    }, 300);
  }
}
