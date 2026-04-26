import type {
  Order,
  Payment,
  Project,
  Role,
  MessengerType,
  TokenTransaction,
} from '@allvision/database';

export type AccountUser = {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  tokenBalance: number;
  role: Role;
  messenger: string | null;
  messengerType: MessengerType | null;
  createdAt: Date | string;
};

export type DashboardStats = {
  totalProjects: number;
  completedProjects: number;
  activeOrders: number;
  totalSpent: number;
};

export type DashboardResponse = {
  user: AccountUser;
  stats: DashboardStats;
  recentProjects: Project[];
  activeOrders: Order[];
  recentTransactions: TokenTransaction[];
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
};

export type TransactionsResponse = Paginated<TokenTransaction>;
export type PaymentsResponse = Paginated<Payment>;

export type UpdateProfileResponse = { user: AccountUser };
