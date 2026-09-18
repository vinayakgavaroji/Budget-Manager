import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

export interface UserProfile {
  name: string;
  email: string;
}

export interface RegisteredUser {
  name: string;
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly SESSION_KEY = 'budget_manager_user';
  private readonly USERS_KEY = 'budget_manager_registered_users';

  readonly currentUser = signal<UserProfile | null>(this.loadUserFromStorage());
  readonly isLoggedIn = signal<boolean>(!!this.currentUser());

  constructor(private router: Router) {
    this.ensureDefaultUsers();
  }

  private loadUserFromStorage(): UserProfile | null {
    try {
      const stored = localStorage.getItem(this.SESSION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private getRegisteredUsers(): RegisteredUser[] {
    try {
      const stored = localStorage.getItem(this.USERS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveRegisteredUsers(users: RegisteredUser[]): void {
    try {
      localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    } catch {
      // Ignore storage errors
    }
  }

  private ensureDefaultUsers(): void {
    const existing = this.getRegisteredUsers();
    if (existing.length === 0) {
      const defaults: RegisteredUser[] = [
        {
          name: 'Jack Sparrow',
          email: 'jack.sparrow@potc.com',
          password: 'password123'
        },
        {
          name: 'Alex Morgan',
          email: 'alex.morgan@example.com',
          password: 'password123'
        }
      ];
      this.saveRegisteredUsers(defaults);
    }
  }

  login(email: string, pass: string): AuthResult {
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !pass) {
      return { success: false, message: 'Please fill in both email and password.' };
    }

    const users = this.getRegisteredUsers();
    const foundUser = users.find(u => u.email.toLowerCase() === cleanEmail);

    if (!foundUser) {
      return {
        success: false,
        message: 'No account found with this email. Please click "Sign Up" to create one.'
      };
    }

    if (foundUser.password !== pass) {
      return { success: false, message: 'Incorrect password. Please try again.' };
    }

    const user: UserProfile = {
      name: foundUser.name,
      email: foundUser.email
    };

    this.saveUserSession(user);
    return { success: true };
  }

  register(name: string, email: string, pass: string): AuthResult {
    const cleanName = name ? name.trim() : '';
    const cleanEmail = email ? email.trim().toLowerCase() : '';

    if (!cleanName || !cleanEmail || !pass) {
      return { success: false, message: 'Please fill in all required fields.' };
    }

    const users = this.getRegisteredUsers();
    const existing = users.find(u => u.email.toLowerCase() === cleanEmail);

    if (existing) {
      return {
        success: false,
        message: 'An account with this email already exists. Please Sign In.'
      };
    }

    const newUser: RegisteredUser = {
      name: cleanName,
      email: cleanEmail,
      password: pass
    };

    users.push(newUser);
    this.saveRegisteredUsers(users);

    // Automatically log in newly registered user
    const profile: UserProfile = {
      name: newUser.name,
      email: newUser.email
    };
    this.saveUserSession(profile);

    return { success: true };
  }

  demoLogin(): void {
    const demoUser: UserProfile = {
      name: 'Jack Sparrow',
      email: 'jack.sparrow@potc.com'
    };
    this.saveUserSession(demoUser);
  }

  logout(): void {
    try {
      localStorage.removeItem(this.SESSION_KEY);
    } catch {
      // Ignore storage errors
    }
    this.currentUser.set(null);
    this.isLoggedIn.set(false);
    this.router.navigate(['/login']);
  }

  private saveUserSession(user: UserProfile): void {
    try {
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
    } catch {
      // Ignore storage errors
    }
    this.currentUser.set(user);
    this.isLoggedIn.set(true);
  }
}
