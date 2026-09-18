/* Topic: Cost & Billing */
AWSCHEAT.register({
  id: 'cost',
  title: 'Cost & Billing',
  order: 15,
  intro: 'Cost Explorer (`ce`) is a global service served from us-east-1 and every API call costs $0.01, so use `--query` to shape the response rather than calling repeatedly. Dates are `YYYY-MM-DD`, the end date is exclusive, and data lags 24–48 hours.',
  subtopics: [
    { id: 'explorer', title: 'Cost Explorer' },
    { id: 'optimisation', title: 'Forecasts, anomalies, rightsizing' },
    { id: 'budgets', title: 'Budgets' }
  ],
  cards: [
    {
      id: 'get-cost-and-usage',
      subtopic: 'explorer',
      title: 'Last month\'s cost by service',
      command: `aws ce get-cost-and-usage \\
  --time-period Start=$(date -d "$(date +%Y-%m-01) -1 month" +%Y-%m-%d),End=$(date +%Y-%m-01) \\
  --granularity MONTHLY \\
  --metrics UnblendedCost \\
  --group-by Type=DIMENSION,Key=SERVICE \\
  --query 'ResultsByTime[0].Groups[?Metrics.UnblendedCost.Amount > \`1\`].[Keys[0],Metrics.UnblendedCost.Amount,Metrics.UnblendedCost.Unit]' \\
  --output table`,
      description: 'The canonical bill breakdown. The date arithmetic yields the first day of last month to the first of this month. The JMESPath filter drops sub-dollar services so the table stays readable.',
      flags: [
        ['--time-period Start=…,End=…', 'End is exclusive. Max range 13 months for daily granularity, 38 for monthly with the setting enabled.'],
        ['--metrics', 'UnblendedCost (what you pay), AmortizedCost (RIs/SPs spread), BlendedCost, UsageQuantity, NetAmortizedCost.'],
        ['--group-by Type=DIMENSION,Key=', 'SERVICE, LINKED_ACCOUNT, REGION, INSTANCE_TYPE, USAGE_TYPE, …; up to two groups.'],
        ['--filter file://filter.json', '(optional) Expression such as `{"Dimensions":{"Key":"REGION","Values":["us-east-1"]}}`.']
      ],
      output: { format: 'table', body: `------------------------------------------------------------------------
|                           GetCostAndUsage                            |
+------------------------------------------+-------------------+-------+
|  Amazon Elastic Compute Cloud - Compute  |  4213.9184739017  |  USD  |
|  Amazon Relational Database Service      |  1876.4402110000  |  USD  |
|  Amazon Simple Storage Service           |  412.0187330121   |  USD  |
|  AmazonCloudWatch                        |  238.7710013900   |  USD  |
|  EC2 - Other                             |  197.3322010000   |  USD  |
+------------------------------------------+-------------------+-------+` },
      note: { type: 'gotcha', text: 'Amounts are strings, so a numeric JMESPath comparison like `> \\`1\\`` compares lexically and mostly works but is not exact; for real thresholds parse with `jq`. On macOS replace the `date -d` arithmetic with `date -v-1m`.' },
      iam: ['ce:GetCostAndUsage'],
      related: ['cost-daily-trend', 'cost-by-tag', 'cost-by-account'],
      tags: ['read-only', 'query', 'cost']
    },
    {
      id: 'daily-trend',
      subtopic: 'explorer',
      title: 'Daily spend for the last two weeks',
      command: `aws ce get-cost-and-usage \\
  --time-period Start=$(date -d '-14 days' +%Y-%m-%d),End=$(date +%Y-%m-%d) \\
  --granularity DAILY \\
  --metrics UnblendedCost \\
  --query 'ResultsByTime[].[TimePeriod.Start,Total.UnblendedCost.Amount]' \\
  --output text`,
      description: 'A quick trend line to spot the day something changed. Without `--group-by` the totals land under `Total`; with grouping they move under `Groups[]`.',
      flags: [
        ['--granularity DAILY', 'Also HOURLY (last 14 days, must be enabled) and MONTHLY.'],
        ['Total.UnblendedCost.Amount', 'Present only when there is no `--group-by`.']
      ],
      output: { format: 'text', body: `2026-09-04	228.4013127890
2026-09-05	231.1198420011
2026-09-06	229.8867501200
2026-09-07	402.5561230098
2026-09-08	405.0129877712` },
      iam: ['ce:GetCostAndUsage'],
      related: ['cost-get-cost-and-usage', 'cost-anomalies'],
      tags: ['read-only', 'query', 'cost']
    },
    {
      id: 'by-tag',
      subtopic: 'explorer',
      title: 'Cost by a cost-allocation tag, filtered to one environment',
      command: `aws ce get-cost-and-usage \\
  --time-period Start=$(date +%Y-%m-01),End=$(date -d '+1 day' +%Y-%m-%d) \\
  --granularity MONTHLY \\
  --metrics UnblendedCost \\
  --group-by Type=TAG,Key=Team \\
  --filter '{"Tags":{"Key":"Environment","Values":["prod"],"MatchOptions":["EQUALS"]}}' \\
  --query 'ResultsByTime[0].Groups[].[Keys[0],Metrics.UnblendedCost.Amount]' \\
  --output text`,
      description: 'Month-to-date production spend split by team. Tags must be activated as cost-allocation tags in Billing before they appear here, and only usage after activation is tagged.',
      flags: [
        ['--group-by Type=TAG,Key=Team', 'Group keys come back as `Team$value`; an empty value means untagged.'],
        ['--filter', 'Cost Explorer expression JSON: `Tags`, `Dimensions`, `CostCategories`, combinable with `And`/`Or`/`Not`.']
      ],
      output: { format: 'text', body: `Team$platform	3102.1187730000
Team$data	1287.5501209900
Team$	412.0700051000` },
      iam: ['ce:GetCostAndUsage'],
      related: ['cost-get-cost-and-usage', 'ec2-create-tags'],
      tags: ['read-only', 'query', 'cost']
    },
    {
      id: 'by-account',
      subtopic: 'explorer',
      title: 'Cost per linked account (from the payer)',
      command: `aws ce get-cost-and-usage \\
  --time-period Start=$(date +%Y-%m-01),End=$(date -d '+1 day' +%Y-%m-%d) \\
  --granularity MONTHLY \\
  --metrics UnblendedCost \\
  --group-by Type=DIMENSION,Key=LINKED_ACCOUNT \\
  --query 'sort_by(ResultsByTime[0].Groups,&Metrics.UnblendedCost.Amount)[::-1].[Keys[0],Metrics.UnblendedCost.Amount]' \\
  --output text`,
      description: 'Run from the management or a delegated billing account to see every member account\'s month-to-date spend. `[::-1]` reverses the sort so the biggest is first (string sort, adequate for same-magnitude amounts).',
      flags: [
        ['Key=LINKED_ACCOUNT', 'Account IDs as keys. `get-dimension-values --dimension LINKED_ACCOUNT` maps IDs to names.']
      ],
      output: { format: 'text', body: `123456789012	5811.2200187000
123456789012	1203.9000431000
123456789012	88.1200001000` },
      iam: ['ce:GetCostAndUsage'],
      related: ['security-org-list-accounts', 'cost-get-cost-and-usage'],
      tags: ['read-only', 'query', 'cost']
    },
    {
      id: 'dimension-values',
      subtopic: 'explorer',
      title: 'Discover valid values for a dimension (service names, usage types)',
      command: `aws ce get-dimension-values \\
  --time-period Start=$(date -d '-30 days' +%Y-%m-%d),End=$(date +%Y-%m-%d) \\
  --dimension SERVICE \\
  --search-string "Elastic" \\
  --query 'DimensionValues[].Value' --output text`,
      description: 'Filters need exact dimension values, and service names are long and inconsistent ("Amazon Elastic Compute Cloud - Compute"). This looks them up so your filter matches.',
      flags: [
        ['--dimension', 'SERVICE, USAGE_TYPE, INSTANCE_TYPE, REGION, LINKED_ACCOUNT, OPERATION, PURCHASE_TYPE, …'],
        ['--search-string', 'Substring, case-insensitive.']
      ],
      output: { format: 'text', body: `Amazon Elastic Compute Cloud - Compute	Amazon Elastic Container Service	Amazon Elastic Load Balancing	Amazon Elastic File System	Amazon Elastic Container Registry` },
      iam: ['ce:GetDimensionValues'],
      related: ['cost-get-cost-and-usage'],
      tags: ['read-only', 'cost']
    },
    {
      id: 'forecast',
      subtopic: 'optimisation',
      title: 'Forecast this month\'s total bill',
      command: `aws ce get-cost-forecast \\
  --time-period Start=$(date +%Y-%m-%d),End=$(date -d "$(date +%Y-%m-01) +1 month" +%Y-%m-%d) \\
  --metric UNBLENDED_COST \\
  --granularity MONTHLY \\
  --prediction-interval-level 80 \\
  --query '{Forecast:Total.Amount,Low:ForecastResultsByTime[0].PredictionIntervalLowerBound,High:ForecastResultsByTime[0].PredictionIntervalUpperBound}'`,
      description: 'Projects spend from today to month end using recent usage. Note the metric enum is upper-case here (`UNBLENDED_COST`) unlike `get-cost-and-usage`.',
      flags: [
        ['--metric', 'UNBLENDED_COST, AMORTIZED_COST, BLENDED_COST, NET_UNBLENDED_COST, USAGE_QUANTITY, …'],
        ['--prediction-interval-level', 'Confidence interval percentage (51–99).']
      ],
      output: { format: 'json', body: `{
    "Forecast": "3384.92",
    "Low": "3210.11",
    "High": "3559.73"
}` },
      iam: ['ce:GetCostForecast'],
      related: ['cost-get-cost-and-usage', 'cost-describe-budgets'],
      tags: ['read-only', 'cost']
    },
    {
      id: 'anomalies',
      subtopic: 'optimisation',
      title: 'Cost anomalies detected in the last 30 days',
      command: `aws ce get-anomalies \\
  --date-interval StartDate=$(date -d '-30 days' +%Y-%m-%d) \\
  --query 'Anomalies[].[AnomalyStartDate,Impact.TotalImpact,Impact.TotalImpactPercentage,RootCauses[0].Service,RootCauses[0].UsageType]' \\
  --output text`,
      description: 'Requires a Cost Anomaly Detection monitor (`create-anomaly-monitor`). Each anomaly carries a dollar impact and the service/usage type most responsible, which is often faster than eyeballing the daily trend.',
      flags: [
        ['--date-interval', 'StartDate required; EndDate optional.'],
        ['--feedback YES', '(optional) Only anomalies you confirmed as real.']
      ],
      output: { format: 'text', body: `2026-09-07T00:00:00Z	1210.44	74.2	AmazonCloudWatch	USE1-DataProcessing-Bytes` },
      iam: ['ce:GetAnomalies'],
      related: ['cost-daily-trend', 'cloudwatch-describe-log-groups'],
      tags: ['read-only', 'cost']
    },
    {
      id: 'rightsizing',
      subtopic: 'optimisation',
      title: 'EC2 rightsizing recommendations',
      command: `aws ce get-rightsizing-recommendation \\
  --service AmazonEC2 \\
  --configuration RecommendationTarget=SAME_INSTANCE_FAMILY,BenefitsConsidered=true \\
  --query 'RightsizingRecommendations[].[CurrentInstance.ResourceId,CurrentInstance.ResourceDetails.EC2ResourceDetails.InstanceType,RightsizingType,ModifyRecommendationDetail.TargetInstances[0].ResourceDetails.EC2ResourceDetails.InstanceType,ModifyRecommendationDetail.TargetInstances[0].EstimatedMonthlySavings]' \\
  --output text`,
      description: 'Cost Explorer\'s view of over-provisioned instances based on 14 days of CloudWatch utilisation. `Terminate` recommendations are idle instances; `Modify` ones suggest a smaller type with the savings estimate.',
      flags: [
        ['RecommendationTarget', 'SAME_INSTANCE_FAMILY or CROSS_INSTANCE_FAMILY (e.g. suggest Graviton).'],
        ['BenefitsConsidered', 'Account for existing RIs and Savings Plans in the savings estimate.'],
        ['aws compute-optimizer get-ec2-instance-recommendations', 'The richer alternative, including memory metrics if the CloudWatch agent reports them.']
      ],
      output: { format: 'text', body: `i-0123456789abcdef0	m5.large	Modify	m5.medium	31.42
i-0fedcba9876543210	m5.large	Terminate	None	None` },
      iam: ['ce:GetRightsizingRecommendation'],
      related: ['ec2-modify-instance-type', 'ec2-describe-volumes-unattached'],
      tags: ['read-only', 'cost']
    },
    {
      id: 'describe-budgets',
      subtopic: 'budgets',
      title: 'List budgets with limit and actual spend',
      command: `aws budgets describe-budgets --account-id 123456789012 \\
  --query 'Budgets[].[BudgetName,BudgetType,BudgetLimit.Amount,CalculatedSpend.ActualSpend.Amount,CalculatedSpend.ForecastedSpend.Amount]' \\
  --output text`,
      description: 'Budgets are the free alerting layer on top of Cost Explorer. The account ID is mandatory on every `budgets` call, even for your own account.',
      flags: [
        ['--account-id', 'Required. Your own account ID or a member account from the payer.'],
        ['describe-budget-performance-history --budget-name', 'Past months\' actual vs budget.']
      ],
      output: { format: 'text', body: `monthly-total	COST	5000.0	3102.44	3384.92
ec2-prod	COST	4000.0	4213.92	4501.10` },
      iam: ['budgets:ViewBudget'],
      related: ['cost-create-budget', 'cost-forecast'],
      tags: ['read-only', 'cost']
    },
    {
      id: 'create-budget',
      subtopic: 'budgets',
      title: 'Create a monthly cost budget with an 80% email alert',
      command: `aws budgets create-budget --account-id 123456789012 \\
  --budget '{"BudgetName":"monthly-total","BudgetType":"COST","TimeUnit":"MONTHLY","BudgetLimit":{"Amount":"5000","Unit":"USD"}}' \\
  --notifications-with-subscribers '[{
    "Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80,"ThresholdType":"PERCENTAGE"},
    "Subscribers":[{"SubscriptionType":"EMAIL","Address":"finops@example.com"}]
  },{
    "Notification":{"NotificationType":"FORECASTED","ComparisonOperator":"GREATER_THAN","Threshold":100,"ThresholdType":"PERCENTAGE"},
    "Subscribers":[{"SubscriptionType":"SNS","Address":"arn:aws:sns:us-east-1:123456789012:<topic-name>"}]
  }]'`,
      description: 'Two alerts: one when actual spend passes 80% of the limit, one when the forecast says you will exceed 100%. Budgets can also carry `CostFilters` (service, tag, account) to scope them.',
      flags: [
        ['--budget', 'JSON with name, type (COST, USAGE, RI_UTILIZATION, SAVINGS_PLANS_COVERAGE, …), time unit and limit.'],
        ['NotificationType', 'ACTUAL or FORECASTED.'],
        ['SubscriptionType', 'EMAIL (up to 10 addresses) or SNS (topic policy must allow `budgets.amazonaws.com`).']
      ],
      output: { format: 'none', body: '' },
      iam: ['budgets:ModifyBudget'],
      related: ['cost-describe-budgets', 'cost-forecast'],
      tags: ['mutating', 'cost']
    }
  ]
});
