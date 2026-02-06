/**
 * Tool Integration Test Script
 *
 * This script tests all builtin tools to ensure they work with real Anode APIs.
 * Run this on an Android device with ACS to verify tool functionality.
 */
import { fileTools } from './tools/builtin/FileTools.js';
import { deviceTools } from './tools/builtin/DeviceTools.js';
import { networkTools } from './tools/builtin/NetworkTools.js';
import { androidTools } from './tools/builtin/AndroidTools.js';
async function testTools() {
    console.log('=== Starting Tool Integration Tests ===\n');
    // Test Device Tools
    console.log('--- Testing Device Tools ---');
    try {
        const deviceInfo = deviceTools.find(t => t.name === 'get_device_info');
        if (deviceInfo) {
            const result = await deviceInfo.execute({}, {});
            console.log('✓ get_device_info:', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                console.log('  Device:', result.output);
            }
        }
        const batteryInfo = deviceTools.find(t => t.name === 'get_battery_info');
        if (batteryInfo) {
            const result = await batteryInfo.execute({}, {});
            console.log('✓ get_battery_info:', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                console.log('  Battery:', result.output);
            }
        }
        const currentApp = deviceTools.find(t => t.name === 'get_current_app');
        if (currentApp) {
            const result = await currentApp.execute({}, {});
            console.log('✓ get_current_app:', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                console.log('  App:', result.output);
            }
        }
        const toast = deviceTools.find(t => t.name === 'show_toast');
        if (toast) {
            const result = await toast.execute({ message: 'Test Toast', duration: 'short' }, {});
            console.log('✓ show_toast:', result.success ? 'PASS' : 'FAIL');
        }
    }
    catch (error) {
        console.error('✗ Device Tools Error:', error);
    }
    // Test File Tools
    console.log('\n--- Testing File Tools ---');
    try {
        const testPath = './data/anode-clawdbot-test.txt';
        const testContent = 'Hello from Anode ClawdBot!';
        const writeTool = fileTools.find(t => t.name === 'write_file');
        if (writeTool) {
            const result = await writeTool.execute({ path: testPath, content: testContent }, {});
            console.log('✓ write_file:', result.success ? 'PASS' : 'FAIL');
        }
        const existsTool = fileTools.find(t => t.name === 'file_exists');
        if (existsTool) {
            const result = await existsTool.execute({ path: testPath }, {});
            console.log('✓ file_exists:', result.success ? 'PASS' : 'FAIL');
            console.log('  Exists:', result.output?.exists);
        }
        const readTool = fileTools.find(t => t.name === 'read_file');
        if (readTool) {
            const result = await readTool.execute({ path: testPath }, {});
            console.log('✓ read_file:', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                console.log('  Content matches:', result.output?.content === testContent);
            }
        }
        const deleteTool = fileTools.find(t => t.name === 'delete_file');
        if (deleteTool) {
            const result = await deleteTool.execute({ path: testPath }, {});
            console.log('✓ delete_file:', result.success ? 'PASS' : 'FAIL');
        }
    }
    catch (error) {
        console.error('✗ File Tools Error:', error);
    }
    // Test Network Tools
    console.log('\n--- Testing Network Tools ---');
    try {
        const httpTool = networkTools.find(t => t.name === 'http_request');
        if (httpTool) {
            const result = await httpTool.execute({
                url: 'https://api.github.com/repos/anthropics/claude-code',
                method: 'GET'
            }, {});
            console.log('✓ http_request:', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                console.log('  Status:', result.output?.status);
            }
        }
        // Skip download test to avoid creating files
        console.log('✓ download_file: SKIPPED (manual test required)');
    }
    catch (error) {
        console.error('✗ Network Tools Error:', error);
    }
    // Test Android Tools
    console.log('\n--- Testing Android Tools (READ-ONLY) ---');
    try {
        const findTextTool = androidTools.find(t => t.name === 'android_find_text');
        if (findTextTool) {
            const result = await findTextTool.execute({ text: 'Settings', exact: false }, {});
            console.log('✓ android_find_text:', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                console.log('  Found:', result.output?.found, 'Count:', result.output?.count);
            }
        }
        // Skip other Android tools that perform actions
        console.log('✓ android_click: SKIPPED (requires manual test)');
        console.log('✓ android_swipe: SKIPPED (requires manual test)');
        console.log('✓ android_input_text: SKIPPED (requires manual test)');
        console.log('✓ android_screenshot: SKIPPED (requires manual test)');
        console.log('✓ android_find_id: SKIPPED (requires manual test)');
    }
    catch (error) {
        console.error('✗ Android Tools Error:', error);
    }
    console.log('\n=== Tool Integration Tests Complete ===');
}
// Run tests
testTools().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
