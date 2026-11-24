/**
 * Official CRIF Account Aggregator Analytics UAT Response Payload
 * Matches the official CRIF Swagger specification for POST /fiu-ws/analytics/fetch
 */

function buildCrifAnalyticsPayload({ trackingId, referenceId, analysisId, subjectId, accountId }) {
  const currentSubjectId = subjectId || '7379282988@crif';
  const currentAccountId = accountId || 'XXXXXXXXX2631-SAVINGS';
  const currentAnalysisId = analysisId || '0657eaff-30db-4b54-8ad1-b081dc7abcb0';
  const currentReferenceId = referenceId || 'dc88459b-7925-4d74-961b-91e9825fa2e4';

  return {
    status: 'COMPLETED',
    timestamp: new Date().toISOString(),
    trackingId: trackingId || 'consent 1',
    referenceId: currentReferenceId,
    analysisId: currentAnalysisId,
    data: {
      analytics: {
        consumer: {
          base: {
            subject: {
              subjectId: currentSubjectId,
              dataPeriod: {
                startDate: '2020-04-12',
                endDate: '2024-04-18',
                daysCount: 1468,
                fullMonthCount: 47,
              },
              kpi: {
                countriesCount: 1,
                providersCount: 1,
                accountsCount: 1,
                significantAccountsCount: 0,
                balance: {
                  totalBalanceAmount: 16344.28,
                  averageBalanceAmount: 863079.96,
                  medianBalanceAmount: 163340.75,
                  minBalanceAmount: 16344.28,
                  maxBalanceAmount: 1740804.75,
                },
                periodTransactionsCount: {
                  total: 693,
                  income: 199,
                  expenses: 494,
                },
                monthlyTransactionsCount: {
                  total: 14,
                  income: 4,
                  expenses: 10,
                },
              },
              connections: [
                {
                  connectionId: 'AXIS BANK',
                  dataPeriod: {
                    startDate: '2020-04-12',
                    endDate: '2024-04-18',
                    daysCount: 1468,
                    fullMonthCount: 47,
                  },
                  kpi: {
                    accountsCount: 1,
                    significantAccountsCount: 0,
                    maximumSignificanceIndex: 4,
                    balance: {
                      totalBalanceAmount: 16344.28,
                      averageBalanceAmount: 863079.96,
                      medianBalanceAmount: 163340.75,
                      minBalanceAmount: 16344.28,
                      maxBalanceAmount: 1740804.75,
                    },
                    periodTransactionsCount: {
                      total: 693,
                      income: 199,
                      expenses: 494,
                    },
                    monthlyTransactionsCount: {
                      total: 14,
                      income: 4,
                      expenses: 10,
                    },
                  },
                  accounts: [
                    {
                      accountId: currentAccountId,
                      warnings: {
                        withoutTransactions: false,
                      },
                      dataPeriod: {
                        startDate: '2020-04-12',
                        endDate: '2024-04-18',
                        daysCount: 1468,
                        fullMonthCount: 47,
                      },
                      kpi: {
                        balance: {
                          totalBalanceAmount: 16344.28,
                          averageBalanceAmount: 863079.96,
                          medianBalanceAmount: 163340.75,
                          minBalanceAmount: 16344.28,
                          maxBalanceAmount: 1740804.75,
                        },
                        periodTransactionsCount: {
                          total: 693,
                          income: 199,
                          expenses: 494,
                        },
                        monthlyTransactionsCount: {
                          total: 14,
                          income: 4,
                          expenses: 10,
                        },
                        significanceIndex: 4,
                        newestTransactionDays: 0,
                        oldestTransactionDays: 1210,
                      },
                    },
                  ],
                },
              ],
            },
          },
          identity: {
            verification: 'none',
            soleTrader: false,
          },
          creditScore: {
            score: 456,
            tranche: 3,
            area: 'high',
            factors: ['1010', '1026', '1038'],
          },
          risk: {
            riskBand: 'HIGH',
            indebtedness: {
              loanInstalment: {
                periodTotalTransactionsAmount: -12967.02,
                periodTotalTransactionsCount: 11,
                monthlyAverageTransactionsAmount: -264.99,
                monthlyAverageTransactionsCount: 0,
              },
              total: {
                periodTotalTransactionsAmount: -12967.02,
                periodTotalTransactionsCount: 11,
                monthlyAverageTransactionsAmount: -264.99,
                monthlyAverageTransactionsCount: 0,
              },
              incomeRatio: 0.04,
            },
            gamblingAndGames: {
              onlineGames: {
                periodTotalTransactionsAmount: -560,
                periodTotalTransactionsCount: 28,
                monthlyAverageTransactionsAmount: -11.44,
                monthlyAverageTransactionsCount: 1,
                regularity: 0.02,
                expensesRatio: 0,
                incomeRatio: 0,
              },
            },
          },
          cashFlow: {
            monthlyAnalysis: [
              {
                month: '2024-04',
                fullMonth: false,
                incomeAmount: 0,
                expensesAmount: -11000,
                expensesByCategory: [
                  {
                    code: 'OO_03',
                    amount: -11000,
                    count: 11,
                  },
                ],
                savingAmount: -11000,
                savingRatio: 0,
                incomeExpensesRatio: 0,
                overdraft: {
                  balanceBelowZeroDays: 0,
                },
                balance: {
                  openingBalanceAmount: 27344.28,
                  closingBalanceAmount: 16344.28,
                  averageBalanceAmount: 26733.17,
                  medianBalanceAmount: 27344.28,
                  minimumBalanceAmount: 16344.28,
                  maximumBalanceAmount: 27344.28,
                },
              },
              {
                month: '2024-03',
                fullMonth: true,
                incomeAmount: 45000,
                expensesAmount: -38500,
                savingAmount: 6500,
                savingRatio: 0.14,
                incomeExpensesRatio: 0.85,
              },
              {
                month: '2024-02',
                fullMonth: true,
                incomeAmount: 52000,
                expensesAmount: -41200,
                savingAmount: 10800,
                savingRatio: 0.20,
                incomeExpensesRatio: 0.79,
              },
              {
                month: '2024-01',
                fullMonth: true,
                incomeAmount: 48000,
                expensesAmount: -39000,
                savingAmount: 9000,
                savingRatio: 0.18,
                incomeExpensesRatio: 0.81,
              },
              {
                month: '2023-12',
                fullMonth: true,
                incomeAmount: 60000,
                expensesAmount: -52000,
                savingAmount: 8000,
                savingRatio: 0.13,
                incomeExpensesRatio: 0.86,
              },
              {
                month: '2023-11',
                fullMonth: true,
                incomeAmount: 311311,
                incomeByCategory: [
                  {
                    code: 'RE_05',
                    amount: 2640,
                    count: 11,
                  },
                  {
                    code: 'RE_07',
                    amount: 308110,
                    count: 44,
                  },
                  {
                    code: 'LO_00',
                    amount: 561,
                    count: 11,
                  },
                ],
                expensesAmount: -368970.47,
                expensesByCategory: [
                  {
                    code: 'OO_05',
                    amount: -3135,
                    count: 11,
                  },
                  {
                    code: 'LO_03',
                    amount: -12967.02,
                    count: 11,
                  },
                  {
                    code: 'OO_03',
                    amount: -346543.45,
                    count: 220,
                  },
                  {
                    code: 'HF_07',
                    amount: -6325,
                    count: 11,
                  },
                ],
                savingAmount: -57659.47,
                savingRatio: -0.19,
                incomeExpensesRatio: 0.84,
                overdraft: {
                  balanceBelowZeroDays: 0,
                },
                balance: {
                  openingBalanceAmount: 85003.75,
                  closingBalanceAmount: 27344.28,
                  averageBalanceAmount: 27133.06,
                  medianBalanceAmount: 27344.28,
                  minimumBalanceAmount: 19743.28,
                  maximumBalanceAmount: 38376.73,
                },
              },
              {
                month: '2023-10',
                fullMonth: true,
                incomeAmount: 39171,
                expensesAmount: -117480,
                savingAmount: -78309,
              },
            ],
          },
        },
      },
    },
  };
}

module.exports = { buildCrifAnalyticsPayload };
