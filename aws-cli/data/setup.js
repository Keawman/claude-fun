/* Topic: Setup & Config */
AWSCHEAT.register({
  id: 'setup',
  title: 'Setup & Config',
  order: 1,
  intro: 'Getting the CLI installed, authenticated and behaving predictably. Precedence for every setting is: command-line flag, then environment variable, then the profile in `~/.aws/config`, then the `[default]` profile.',
  subtopics: [
    { id: 'install', title: 'Install & version' },
    { id: 'profiles', title: 'Profiles & credentials' },
    { id: 'sso', title: 'IAM Identity Center (SSO)' },
    { id: 'env', title: 'Environment variables & files' },
    { id: 'behaviour', title: 'Output, pager, prompt, aliases' }
  ],
  cards: [
    {
      id: 'version',
      subtopic: 'install',
      title: 'Confirm you are running CLI v2',
      command: `aws --version`,
      description: 'Everything on this page assumes v2. The version string also tells you the bundled Python and whether you are on the pip (v1) or the self-contained `exe` (v2) build.',
      flags: [],
      output: { format: 'plain', body: `aws-cli/2.17.32 Python/3.11.9 Linux/6.8.0-1017-aws exe/x86_64.ubuntu.22` },
      note: { type: 'gotcha', text: 'If this prints `aws-cli/1.x` you have the legacy pip package. v1 and v2 can coexist but `aws` on PATH wins; check `which -a aws`. v2 changed defaults such as binary-parameter handling (`fileb://`) and added `aws sso`, `aws logs tail`, auto-prompt and YAML output.' },
      related: ['setup-configure', 'setup-configure-list'],
      tags: ['read-only', 'config']
    },
    {
      id: 'configure',
      subtopic: 'profiles',
      title: 'Create or update a named profile interactively',
      command: `aws configure --profile <profile>`,
      description: 'Prompts for the four core settings and writes them to `~/.aws/credentials` (keys) and `~/.aws/config` (region, output). Press Enter to keep an existing value, shown in brackets.',
      flags: [
        ['--profile', 'Profile name. Omit to edit `[default]`.']
      ],
      output: { format: 'plain', body: `AWS Access Key ID [****************ABCD]: AKIAIOSFODNN7EXAMPLE
AWS Secret Access Key [****************wxyz]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Default region name [None]: us-east-1
Default output format [None]: json` },
      note: { type: 'info', text: 'Long-lived access keys on a laptop are the thing IAM Identity Center exists to replace. Prefer `aws configure sso` for humans and roles for machines; keep `aws configure` for CI runners and break-glass users.' },
      iam: [],
      related: ['setup-configure-set', 'setup-sso-configure'],
      tags: ['mutating', 'config', 'interactive']
    },
    {
      id: 'configure-set',
      subtopic: 'profiles',
      title: 'Set or read a single setting non-interactively',
      command: `aws configure set region us-west-2 --profile <profile>
aws configure set cli_pager "" --profile <profile>
aws configure get region --profile <profile>`,
      description: 'Scriptable edits to the config files. `set` writes the key into the profile section, creating the profile if needed; `get` prints one value and exits 1 if it is unset.',
      flags: [
        ['aws configure set <key> <value>', 'Any config key: `region`, `output`, `role_arn`, `source_profile`, `sso_session`, `cli_pager`, `max_attempts`, …'],
        ['aws configure get <key>', 'Read back a single key. Use `profile.<name>.<key>` to target another profile without `--profile`.']
      ],
      output: { format: 'text', body: `us-west-2` },
      iam: [],
      related: ['setup-configure', 'setup-config-files'],
      tags: ['mutating', 'config', 'scripting']
    },
    {
      id: 'list-profiles',
      subtopic: 'profiles',
      title: 'List every configured profile',
      command: `aws configure list-profiles`,
      description: 'Prints the names of all profiles found in both config files, one per line. Handy as the input to a loop that runs the same command across accounts.',
      flags: [],
      output: { format: 'text', body: `default
dev
prod-readonly
gov` },
      iam: [],
      related: ['scripting-loop-profiles', 'setup-configure-list'],
      tags: ['read-only', 'config', 'scripting']
    },
    {
      id: 'sso-configure',
      subtopic: 'sso',
      title: 'Set up an IAM Identity Center profile',
      command: `aws configure sso --profile <profile>`,
      description: 'Walks through the SSO session name, start URL, region and the account/role you want, then writes an `[sso-session]` block and a profile that references it. No long-lived keys are stored.',
      flags: [
        ['--profile', 'Name for the new profile. You are also asked for an SSO session name, which is shared between profiles that use the same start URL.'],
        ['--use-device-code', '(optional) Use the device-code flow instead of opening a browser; needed on headless hosts.']
      ],
      output: { format: 'plain', body: `SSO session name (Recommended): corp
SSO start URL [None]: https://d-0123456789.awsapps.com/start
SSO region [None]: us-east-1
SSO registration scopes [sso:account:access]:
Attempting to automatically open the SSO authorization page in your default browser.
If the browser does not open or you wish to use a different device to authorize this request, open the following URL:

https://device.sso.us-east-1.amazonaws.com/

Then enter the code:

QWER-TYUI
There are 3 AWS accounts available to you.
Using the account ID 123456789012
The only role available to you is: PowerUserAccess
Using the role name "PowerUserAccess"
CLI default client Region [None]: us-east-1
CLI default output format [None]: json

To use this profile, specify the profile name using --profile, as shown:

aws s3 ls --profile dev` },
      iam: [],
      related: ['setup-sso-login', 'setup-config-files'],
      tags: ['mutating', 'config', 'interactive']
    },
    {
      id: 'sso-login',
      subtopic: 'sso',
      title: 'Log in (and out) of an SSO session',
      command: `aws sso login --profile <profile>
aws sso logout`,
      description: 'Opens the browser to authorise, then caches a short-lived token under `~/.aws/sso/cache`. Every profile sharing the same `sso-session` is logged in at once. `logout` removes the cached tokens.',
      flags: [
        ['--profile', 'A profile with `sso_session` set. Alternatively `--sso-session <name>` logs in a session directly.'],
        ['--no-browser', 'Print the URL and code instead of launching a browser.']
      ],
      output: { format: 'plain', body: `Attempting to automatically open the SSO authorization page in your default browser.
If the browser does not open or you wish to use a different device to authorize this request, open the following URL:

https://device.sso.us-east-1.amazonaws.com/

Then enter the code:

QWER-TYUI
Successfully logged into Start URL: https://d-0123456789.awsapps.com/start` },
      note: { type: 'gotcha', text: 'The classic error `Error loading SSO Token: Token for corp does not exist` or `The SSO session associated with this profile has expired` just means: run `aws sso login` again. Session length is set by the Identity Center admin (1–90 days).' },
      iam: [],
      related: ['setup-sso-configure', 'sts-get-caller-identity'],
      tags: ['mutating', 'config', 'interactive']
    },
    {
      id: 'env-vars',
      subtopic: 'env',
      title: 'Drive the CLI with environment variables',
      command: `export AWS_PROFILE=<profile>
export AWS_REGION=us-east-1
export AWS_DEFAULT_OUTPUT=json
export AWS_PAGER=""
aws sts get-caller-identity`,
      description: 'Environment variables beat the config file and lose to command-line flags. `AWS_PROFILE` is the one to set in a shell you will work in for a while; the credential trio (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`) overrides every profile.',
      flags: [
        ['AWS_PROFILE', 'Which profile to use. Same as `--profile` on every command.'],
        ['AWS_REGION', 'Region for v2 (v1 only reads `AWS_DEFAULT_REGION`; v2 reads both, `AWS_REGION` wins).'],
        ['AWS_DEFAULT_OUTPUT', 'json, yaml, yaml-stream, text or table.'],
        ['AWS_PAGER', 'Empty string disables the pager. Otherwise a command such as `less -R`.'],
        ['AWS_CONFIG_FILE / AWS_SHARED_CREDENTIALS_FILE', 'Point at non-default config files, e.g. in CI.'],
        ['AWS_ENDPOINT_URL', 'Global endpoint override (v2.13+), plus per-service `AWS_ENDPOINT_URL_S3`, `AWS_ENDPOINT_URL_DYNAMODB`, …']
      ],
      output: { format: 'json', body: `{
    "UserId": "AROAEXAMPLEID:alice",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/PowerUserAccess/alice"
}` },
      note: { type: 'gotcha', text: 'If `AWS_ACCESS_KEY_ID` is exported in your shell, `--profile` is silently ignored for credentials (region still comes from the profile). `env | grep ^AWS_` is the first thing to check when the wrong identity shows up.' },
      iam: ['sts:GetCallerIdentity'],
      related: ['setup-configure-list', 'sts-assume-role-export'],
      tags: ['read-only', 'config']
    },
    {
      id: 'config-files',
      subtopic: 'env',
      title: 'Config and credentials file layout',
      command: `cat ~/.aws/config ~/.aws/credentials`,
      description: 'Two INI files. `config` holds everything except secrets and prefixes profile sections with `profile `; `credentials` holds keys and uses bare section names. Role chaining, SSO and external credential helpers are all declared here.',
      flags: [
        ['[profile x] vs [x]', 'Only the config file uses the `profile ` prefix. Getting this wrong makes the profile "not found".'],
        ['role_arn + source_profile', 'Assume a role using another profile\'s credentials. `mfa_serial` adds an MFA prompt.'],
        ['sso_session', 'Reference to an `[sso-session]` block (v2.9+ layout). Older `sso_start_url` in the profile still works.'],
        ['credential_process', 'Run an external program that prints JSON credentials (Vault, 1Password, custom brokers).']
      ],
      output: { format: 'plain', body: `# ~/.aws/config
[default]
region = us-east-1
output = json
cli_pager =

[profile dev]
sso_session = corp
sso_account_id = 123456789012
sso_role_name = PowerUserAccess
region = us-east-1

[sso-session corp]
sso_start_url = https://d-0123456789.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access

[profile prod-admin]
role_arn = arn:aws:iam::123456789012:role/Admin
source_profile = dev
mfa_serial = arn:aws:iam::123456789012:mfa/alice
duration_seconds = 3600

[profile vault]
credential_process = /usr/local/bin/vault-aws-creds --role deploy

[profile gov]
region = us-gov-west-1
use_fips_endpoint = true

# ~/.aws/credentials
[gov]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` },
      iam: [],
      related: ['setup-configure-set', 'sts-assume-role-profile', 'govcloud-profile'],
      tags: ['read-only', 'config']
    },
    {
      id: 'profile-region-output',
      subtopic: 'env',
      title: 'Override profile, region and output on a single command',
      command: `aws s3 ls --profile <profile> --region us-west-2 --output text --no-cli-pager`,
      description: 'The three global flags every command accepts. They override environment variables and config for that invocation only, which makes them the safest way to run a one-off against another account.',
      flags: [
        ['--profile', 'Use this profile\'s credentials, region and defaults.'],
        ['--region', 'Send the request to this region regardless of profile or `AWS_REGION`.'],
        ['--output', 'json (default), yaml, yaml-stream, text or table.'],
        ['--no-cli-pager', 'Do not pipe output through `less`, useful when the output is short or being captured.']
      ],
      output: { format: 'plain', body: `2025-04-12 09:15:33 example-bucket
2026-01-08 17:40:02 example-bucket-logs` },
      iam: ['s3:ListAllMyBuckets'],
      related: ['setup-env-vars', 'output-query-text-shapes'],
      tags: ['read-only', 'config']
    },
    {
      id: 'configure-list',
      subtopic: 'env',
      title: 'Show where each active setting comes from',
      command: `aws configure list --profile <profile>`,
      description: 'The fastest way to debug "why am I in the wrong account or region": it prints the resolved value of each setting and whether it came from a flag, environment variable, config file or the instance metadata service.',
      flags: [
        ['--profile', 'Resolve for that profile. Without it you see whatever `AWS_PROFILE` or `default` resolves to.']
      ],
      output: { format: 'plain', body: `      Name                    Value             Type    Location
      ----                    -----             ----    --------
   profile                      dev           manual    --profile
access_key     ****************ABCD              sso
secret_key     ****************wxyz              sso
    region                us-east-1      config-file    ~/.aws/config` },
      iam: [],
      related: ['setup-env-vars', 'sts-get-caller-identity'],
      tags: ['read-only', 'config']
    },
    {
      id: 'regions-table',
      subtopic: 'env',
      title: 'List the regions enabled for this account',
      command: `aws ec2 describe-regions \\
  --query 'Regions[].[RegionName,OptInStatus]' \\
  --output table`,
      description: 'Opt-in regions (Bahrain, Cape Town, Jakarta, Zurich, …) are invisible until enabled and return `AuthFailure` if you point a command at them. Add `--all-regions` to see disabled ones too.',
      flags: [
        ['--all-regions', '(optional) Include regions with `OptInStatus` = `not-opted-in`.'],
        ['--output table', 'Human-readable grid; the list-of-lists projection produces rows with no header.']
      ],
      output: { format: 'table', body: `--------------------------------------------
|             DescribeRegions              |
+------------------+-----------------------+
|  ap-northeast-1  |  opt-in-not-required  |
|  eu-central-2    |  opted-in             |
|  eu-west-1       |  opt-in-not-required  |
|  us-east-1       |  opt-in-not-required  |
|  us-west-2       |  opt-in-not-required  |
+------------------+-----------------------+` },
      iam: ['ec2:DescribeRegions'],
      related: ['scripting-loop-regions', 'govcloud-regions'],
      tags: ['read-only', 'query']
    },
    {
      id: 'pager',
      subtopic: 'behaviour',
      title: 'Turn off the output pager',
      command: `aws configure set cli_pager ""
# or per-shell:
export AWS_PAGER=""
# or per-command:
aws ec2 describe-instances --no-cli-pager`,
      description: 'v2 pipes output through `less` by default, which is disorienting in scripts and CI logs. Any of the three forms disables it; the config-file version is the one to put on every workstation.',
      flags: [
        ['cli_pager', 'Config key. Empty disables. Set to `less -R` (Linux/macOS) or `more` (Windows) to change the pager.'],
        ['--no-cli-pager', 'One-off override. Output already being piped is never paged anyway.']
      ],
      output: { format: 'none', body: '' },
      iam: [],
      related: ['setup-env-vars', 'setup-auto-prompt'],
      tags: ['mutating', 'config']
    },
    {
      id: 'auto-prompt',
      subtopic: 'behaviour',
      title: 'Enable auto-prompt (command and parameter completion)',
      command: `aws configure set cli_auto_prompt on-partial
# one-off:
aws --cli-auto-prompt ec2 describe-instances`,
      description: 'Auto-prompt is a full-screen fuzzy completer for commands, parameters and documentation. `on-partial` only kicks in when a command is incomplete or invalid, so scripts and correct commands are unaffected.',
      flags: [
        ['cli_auto_prompt on', 'Always prompt, even for complete commands. Breaks non-interactive use; prefer `on-partial`.'],
        ['cli_auto_prompt on-partial', 'Prompt only when something is missing or wrong.'],
        ['--no-cli-auto-prompt', 'Disable for a single invocation.']
      ],
      output: { format: 'plain', body: `> aws ec2 describe-instances --
            --filters                   [list]
            --instance-ids              [list]
            --dry-run                   [boolean]
            --max-results               [integer]
            --next-token                [string]
[F2] Fuzzy vs Prefix   [F3] Show documentation   [Enter] Run` },
      iam: [],
      related: ['setup-pager', 'setup-aliases'],
      tags: ['mutating', 'config', 'interactive']
    },
    {
      id: 'aliases',
      subtopic: 'behaviour',
      title: 'Define command aliases in ~/.aws/cli/alias',
      command: `mkdir -p ~/.aws/cli && cat >> ~/.aws/cli/alias <<'EOT'
[toplevel]
whoami = sts get-caller-identity
running = ec2 describe-instances --filters Name=instance-state-name,Values=running --query 'Reservations[].Instances[].[InstanceId,InstanceType,PrivateIpAddress,Tags[?Key==\`Name\`]|[0].Value]' --output table
region = configure get region
EOT
aws whoami`,
      description: 'Aliases live in an INI file and expand to any subcommand plus flags. An alias whose value starts with `!` runs a shell command instead, which lets you wrap `aws` in bash for anything the alias syntax cannot express.',
      flags: [
        ['[toplevel]', 'Aliases usable directly after `aws`. Service-scoped sections (`[command ec2]`) are supported in newer versions.'],
        ['! prefix', 'Shell alias: `myip = !curl -s https://checkip.amazonaws.com`. Positional arguments arrive as `$1`, `$2`.']
      ],
      output: { format: 'json', body: `{
    "UserId": "AROAEXAMPLEID:alice",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/PowerUserAccess/alice"
}` },
      note: { type: 'info', text: 'Aliases do not get shell completion and cannot take `--profile` in the middle of the expansion, but global flags added after the alias (`aws running --profile dev`) work.' },
      iam: ['sts:GetCallerIdentity'],
      related: ['setup-auto-prompt', 'ec2-describe-instances-table'],
      tags: ['mutating', 'config']
    }
  ]
});
