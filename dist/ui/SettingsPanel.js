/**
 * Settings Panel - Configuration UI
 *
 * Floating window for managing application settings
 */
import { logger } from '../utils/logger.js';
/**
 * Settings Panel Class
 *
 * UI component for application configuration
 */
export class SettingsPanel {
    constructor(agentManager, config) {
        this.isVisible = false;
        this.agentManager = agentManager;
        this.config = config;
    }
    /**
     * Show the settings panel
     */
    async show(config = {}) {
        if (this.isVisible) {
            logger.debug('Settings panel already visible');
            return;
        }
        const xml = this.createLayout();
        // Create floating window with correct API pattern
        floatingWindow.create(xml);
        floatingWindow.setSize(config.width ?? 650, config.height ?? 900);
        floatingWindow.setPosition(config.x ?? 100, config.y ?? 150);
        // Setup event listeners
        this.setupEventListeners();
        // Populate current settings
        this.populateSettings();
        // Show window (no parameters)
        floatingWindow.show();
        this.isVisible = true;
        logger.info('Settings panel shown');
    }
    /**
     * Hide the settings panel
     */
    hide() {
        if (!this.isVisible) {
            return;
        }
        floatingWindow.hide(); // No parameters
        this.isVisible = false;
        logger.info('Settings panel hidden');
    }
    /**
     * Close the settings panel
     */
    close() {
        if (!this.isVisible) {
            return;
        }
        floatingWindow.close(); // No parameters
        this.isVisible = false;
        logger.info('Settings panel closed');
    }
    /**
     * Set settings changed callback
     */
    onSettingsChanged(callback) {
        this.onSettingsChangedCallback = callback;
    }
    /**
     * Create layout XML
     */
    createLayout() {
        return `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="#CC1E1E1E">

    <!-- Top Toolbar -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="44dp"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:background="#DD2A2A2A"
        android:paddingStart="12dp"
        android:paddingEnd="8dp">

        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="设置"
            android:textSize="14sp"
            android:textColor="#80CBC4"
            android:textStyle="bold"/>

        <Button
            android:id="@+id/btn_save"
            android:layout_width="36dp"
            android:layout_height="36dp"
            android:text="💾"
            android:textSize="16sp"
            android:textColor="#EAEAEA"
            android:background="#00000000"
            android:minWidth="0dp"
            android:minHeight="0dp"
            android:padding="0dp"/>

        <Button
            android:id="@+id/btn_close"
            android:layout_width="36dp"
            android:layout_height="36dp"
            android:text="✕"
            android:textSize="16sp"
            android:textColor="#EAEAEA"
            android:background="#00000000"
            android:layout_marginStart="4dp"
            android:minWidth="0dp"
            android:minHeight="0dp"
            android:padding="0dp"/>
    </LinearLayout>

    <!-- Settings ScrollView -->
    <ScrollView
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:padding="16dp">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical">

            <!-- Model Settings Section -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="模型设置"
                android:textSize="16sp"
                android:textStyle="bold"
                android:textColor="#80CBC4"
                android:layout_marginBottom="8dp"/>

            <!-- Provider Selection -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="AI 提供商"
                android:textSize="14sp"
                android:textColor="#AAAAAA"
                android:layout_marginTop="8dp"/>

            <Spinner
                android:id="@+id/spinner_provider"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:layout_marginTop="4dp"/>

            <!-- Model Selection -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="模型"
                android:textSize="14sp"
                android:textColor="#AAAAAA"
                android:layout_marginTop="16dp"/>

            <EditText
                android:id="@+id/edit_model"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:hint="例如: claude-sonnet-4-5"
                android:textColor="#EAEAEA"
                android:textColorHint="#888888"
                android:inputType="text"
                android:background="#CC303030"
                android:padding="12dp"
                android:layout_marginTop="4dp"/>

            <!-- API Key -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="API Key"
                android:textSize="14sp"
                android:textColor="#AAAAAA"
                android:layout_marginTop="16dp"/>

            <EditText
                android:id="@+id/edit_api_key"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:hint="输入 API Key"
                android:textColor="#EAEAEA"
                android:textColorHint="#888888"
                android:inputType="textPassword"
                android:background="#CC303030"
                android:padding="12dp"
                android:layout_marginTop="4dp"/>

            <!-- Max Tokens -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="最大 Token 数"
                android:textSize="14sp"
                android:textColor="#AAAAAA"
                android:layout_marginTop="16dp"/>

            <EditText
                android:id="@+id/edit_max_tokens"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:hint="默认: 8192"
                android:textColor="#EAEAEA"
                android:textColorHint="#888888"
                android:inputType="number"
                android:background="#CC303030"
                android:padding="12dp"
                android:layout_marginTop="4dp"/>

            <!-- Divider -->
            <View
                android:layout_width="match_parent"
                android:layout_height="1dp"
                android:background="#444444"
                android:layout_marginTop="24dp"
                android:layout_marginBottom="16dp"/>

            <!-- UI Settings Section -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="界面设置"
                android:textSize="16sp"
                android:textStyle="bold"
                android:textColor="#80CBC4"
                android:layout_marginBottom="8dp"/>

            <!-- Theme Selection -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="主题"
                android:textSize="14sp"
                android:textColor="#AAAAAA"
                android:layout_marginTop="8dp"/>

            <Spinner
                android:id="@+id/spinner_theme"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:layout_marginTop="4dp"/>

            <!-- Divider -->
            <View
                android:layout_width="match_parent"
                android:layout_height="1dp"
                android:background="#444444"
                android:layout_marginTop="24dp"
                android:layout_marginBottom="16dp"/>

            <!-- Tool Settings Section -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="工具管理"
                android:textSize="16sp"
                android:textStyle="bold"
                android:textColor="#80CBC4"
                android:layout_marginBottom="8dp"/>

            <!-- Tool List Container -->
            <LinearLayout
                android:id="@+id/tool_list_container"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="vertical"
                android:layout_marginTop="8dp"/>

            <!-- Divider -->
            <View
                android:layout_width="match_parent"
                android:layout_height="1dp"
                android:background="#444444"
                android:layout_marginTop="24dp"
                android:layout_marginBottom="16dp"/>

            <!-- About Section -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="关于"
                android:textSize="16sp"
                android:textStyle="bold"
                android:textColor="#80CBC4"
                android:layout_marginBottom="8dp"/>

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Anode ClawdBot v0.2.0"
                android:textSize="14sp"
                android:textColor="#AAAAAA"
                android:layout_marginTop="8dp"/>

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Android AI Agent System"
                android:textSize="14sp"
                android:textColor="#AAAAAA"
                android:layout_marginTop="4dp"/>
        </LinearLayout>
    </ScrollView>
</LinearLayout>`;
    }
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Click events - on() returns boolean, not Promise
        const clickSuccess = floatingWindow.on('click', (event) => {
            try {
                if (event.viewId === 'btn_close') {
                    this.hide();
                }
                else if (event.viewId === 'btn_save') {
                    this.handleSaveSettings();
                }
                else if (event.viewId.startsWith('switch_tool_')) {
                    // Tool toggle switch
                    const toolName = event.viewId.replace('switch_tool_', '');
                    this.handleToolToggle(toolName);
                }
            }
            catch (error) {
                logger.error('Error handling click event:', error);
            }
        });
        if (!clickSuccess) {
            logger.error('Failed to register click event listener');
        }
        // Text changed events for live validation
        const textChangedSuccess = floatingWindow.on('textChanged', (event) => {
            if (event.viewId === 'edit_api_key') {
                // Could add validation here
                logger.debug('API key changed');
            }
        });
        if (!textChangedSuccess) {
            logger.error('Failed to register textChanged event listener');
        }
    }
    /**
     * Populate current settings
     */
    populateSettings() {
        try {
            // Set model values using findView + setText pattern
            const editModel = floatingWindow.findView('edit_model');
            if (editModel) {
                floatingWindow.setText(editModel, this.config.model.model);
            }
            const editApiKey = floatingWindow.findView('edit_api_key');
            if (editApiKey) {
                floatingWindow.setText(editApiKey, '••••••••'); // Masked
            }
            const editMaxTokens = floatingWindow.findView('edit_max_tokens');
            if (editMaxTokens) {
                floatingWindow.setText(editMaxTokens, this.config.model.maxTokens.toString());
            }
            // Populate tool list
            this.populateToolList();
        }
        catch (error) {
            logger.error('Error populating settings:', error);
        }
    }
    /**
     * Populate tool list with toggles
     */
    populateToolList() {
        const tools = this.agentManager.getTools();
        for (const tool of tools) {
            const toolItemXml = `
<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:padding="12dp"
    android:gravity="center_vertical">

    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:orientation="vertical">

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="${tool.name}"
            android:textSize="14sp"
            android:textColor="#EAEAEA"
            android:textStyle="bold"/>

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="${tool.description}"
            android:textSize="12sp"
            android:textColor="#AAAAAA"
            android:layout_marginTop="4dp"/>
    </LinearLayout>

    <Switch
        android:id="@+id/switch_tool_${tool.name}"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:checked="true"/>
</LinearLayout>`;
            // Use addView instead of appendView
            floatingWindow.addView(toolItemXml);
        }
    }
    /**
     * Handle save settings
     */
    handleSaveSettings() {
        try {
            // Get values from UI using findView + getText pattern
            const editModel = floatingWindow.findView('edit_model');
            const model = editModel ? floatingWindow.getText(editModel) : this.config.model.model;
            const editMaxTokens = floatingWindow.findView('edit_max_tokens');
            const maxTokensStr = editMaxTokens ? floatingWindow.getText(editMaxTokens) : '8192';
            const maxTokens = parseInt(maxTokensStr) || 8192;
            // Update config
            this.config.model.model = model;
            this.config.model.maxTokens = maxTokens;
            // Notify callback
            if (this.onSettingsChangedCallback) {
                this.onSettingsChangedCallback(this.config);
            }
            logger.info('Settings saved');
            // Close panel
            this.hide();
        }
        catch (error) {
            logger.error('Error saving settings:', error);
        }
    }
    /**
     * Handle tool toggle
     */
    handleToolToggle(toolName) {
        try {
            // Get current state (would need FloatingWindowAPI support)
            // For now, just log
            logger.info(`Tool toggle: ${toolName}`);
            // Enable/disable tool in agent manager
            const enabled = true; // Would get from switch state
            this.agentManager.setToolEnabled(toolName, enabled);
        }
        catch (error) {
            logger.error('Error toggling tool:', error);
        }
    }
}
