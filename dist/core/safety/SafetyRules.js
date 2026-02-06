/**
 * Safety Rules
 *
 * Defines dangerous patterns and risk classifications for commands
 */
/**
 * Dangerous pattern definitions
 */
export const DANGEROUS_PATTERNS = [
    // File deletion patterns (HIGH/CRITICAL risk)
    {
        pattern: /rm\s+(-rf?|--recursive|--force)/i,
        category: 'file_delete',
        riskLevel: 'critical',
        description: 'Recursive or forced file deletion',
        examples: ['rm -rf /', 'rm -rf *', 'rm --force important.txt'],
    },
    {
        pattern: /delete.*\*|remove.*\*/i,
        category: 'file_delete',
        riskLevel: 'high',
        description: 'Wildcard deletion',
        examples: ['delete *', 'remove all files *'],
    },
    {
        pattern: /(delete|remove|unlink).*\.(db|json|config|env)/i,
        category: 'file_delete',
        riskLevel: 'high',
        description: 'Deleting configuration or database files',
        examples: ['delete database.db', 'remove config.json'],
    },
    // File write patterns (MEDIUM/HIGH risk)
    {
        pattern: /write.*\.(env|config|key|pem|credentials)/i,
        category: 'file_write',
        riskLevel: 'high',
        description: 'Writing to sensitive configuration files',
        examples: ['write to .env', 'modify credentials.json'],
    },
    {
        pattern: />|overwrite|replace/i,
        category: 'file_write',
        riskLevel: 'medium',
        description: 'Overwriting existing files',
        examples: ['overwrite file.txt', 'replace config'],
    },
    // System command patterns (HIGH/CRITICAL risk)
    {
        pattern: /(shutdown|reboot|restart|poweroff)/i,
        category: 'system_command',
        riskLevel: 'critical',
        description: 'System shutdown or restart commands',
        examples: ['shutdown now', 'reboot system'],
    },
    {
        pattern: /(format|fdisk|mkfs|parted)/i,
        category: 'system_command',
        riskLevel: 'critical',
        description: 'Disk formatting or partitioning',
        examples: ['format disk', 'fdisk /dev/sda'],
    },
    {
        pattern: /chmod\s+(777|666)/i,
        category: 'system_command',
        riskLevel: 'high',
        description: 'Setting dangerous file permissions',
        examples: ['chmod 777 file', 'chmod 666 important'],
    },
    // Network patterns (MEDIUM risk)
    {
        pattern: /curl.*\|.*sh|wget.*\|.*bash/i,
        category: 'network_request',
        riskLevel: 'critical',
        description: 'Downloading and executing remote scripts',
        examples: ['curl url | sh', 'wget script | bash'],
    },
    {
        pattern: /(post|send|upload).*password|auth.*token/i,
        category: 'network_request',
        riskLevel: 'high',
        description: 'Sending sensitive data over network',
        examples: ['post password to', 'upload auth token'],
    },
    // Data modification (MEDIUM/HIGH risk)
    {
        pattern: /(drop|truncate|delete from).*table/i,
        category: 'data_modification',
        riskLevel: 'critical',
        description: 'Database destructive operations',
        examples: ['drop table users', 'truncate database'],
    },
    {
        pattern: /update.*set.*where/i,
        category: 'data_modification',
        riskLevel: 'medium',
        description: 'Database update operations',
        examples: ['update users set', 'modify database where'],
    },
    // Android automation patterns (LOW/MEDIUM risk)
    {
        pattern: /(install|uninstall)\s+(app|apk|package)/i,
        category: 'automation',
        riskLevel: 'medium',
        description: 'App installation or removal',
        examples: ['install apk', 'uninstall package'],
    },
    {
        pattern: /grant.*permission/i,
        category: 'automation',
        riskLevel: 'medium',
        description: 'Granting permissions',
        examples: ['grant location permission', 'allow access'],
    },
    {
        pattern: /(send|dial|call).*\d{10}/i,
        category: 'automation',
        riskLevel: 'medium',
        description: 'Initiating calls or sending messages',
        examples: ['call 1234567890', 'send SMS to'],
    },
];
/**
 * Tool-specific risk levels
 * Tools not listed are considered 'safe' by default
 */
export const TOOL_RISK_LEVELS = {
    // File operations
    write_file: 'medium',
    delete_file: 'high',
    move_file: 'medium',
    modify_file: 'medium',
    // System operations
    execute_command: 'high',
    run_script: 'high',
    // Network operations
    http_request: 'low',
    download_file: 'medium',
    upload_file: 'medium',
    // App operations (opening apps is safe)
    open_app: 'safe',
    open_app_by_package: 'safe',
    open_url: 'safe',
    open_schema: 'safe',
    get_installed_apps: 'safe',
    is_app_installed: 'safe',
    get_app_version: 'safe',
    get_package_name: 'safe',
    // Android automation
    android_click: 'low',
    android_swipe: 'low',
    android_input_text: 'low',
    android_install_app: 'high',
    android_uninstall_app: 'high',
    android_grant_permission: 'medium',
};
/**
 * Get base risk level for a tool
 */
export function getToolBaseRisk(toolName) {
    return TOOL_RISK_LEVELS[toolName] || 'safe';
}
/**
 * Check if a risk level requires approval based on trust mode
 */
export function requiresApproval(riskLevel, trustMode) {
    switch (trustMode) {
        case 'yolo':
            // YOLO mode: never require approval
            return false;
        case 'strict':
            // Require approval for anything above 'safe'
            return riskLevel !== 'safe';
        case 'moderate':
            // Require approval for medium and above
            return ['medium', 'high', 'critical'].includes(riskLevel);
        case 'permissive':
            // Only require approval for high and critical
            return ['high', 'critical'].includes(riskLevel);
        default:
            return true;
    }
}
