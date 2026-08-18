/** @deprecated import from @/lib/bank-expense-via-expense-mgmt */
export {
  BANK_EXPENSE_VIA_EXPENSE_MGMT_MESSAGE,
  PURCHASE_PAYMENT_VIA_EXPENSE_ONLY_MESSAGE,
  isBankExpenseRelatedWithdrawCategory,
  isDirectBankPurchasePaymentCategory,
  shouldSkipBankAutoJournal,
  assertPurchasePaymentViaExpenseOnly,
  assertWithdrawalManagementPurchaseBlocked,
  normalizeBankWithdrawCategory,
  BANK_WITHDRAW_EXPENSE_RELATED_CATEGORIES,
  BANK_WITHDRAW_UI_CATEGORIES,
  isBankWithdrawCategoryWithoutSubject,
} from '@/lib/bank-expense-via-expense-mgmt'
