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
import { ocrTools } from './tools/builtin/OcrTools.js';
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
        // check_network (sync, should always work)
        const checkNet = networkTools.find(t => t.name === 'check_network');
        if (checkNet) {
            const result = await checkNet.execute({}, {});
            console.log('✓ check_network:', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                console.log('  Connected:', result.output?.isConnected, 'Type:', result.output?.networkType);
            }
        }
        // http_get
        const httpGet = networkTools.find(t => t.name === 'http_get');
        if (httpGet) {
            const result = await httpGet.execute({
                url: 'https://httpbin.org/get'
            }, {});
            console.log('✓ http_get:', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                console.log('  Data type:', typeof result.output?.data);
            }
            else {
                console.log('  Error:', result.error?.message);
            }
        }
        // http_get with headers
        const httpGetHeaders = networkTools.find(t => t.name === 'http_get');
        if (httpGetHeaders) {
            const result = await httpGetHeaders.execute({
                url: 'https://httpbin.org/headers',
                headers: { 'X-Test': 'anode-clawdbot' }
            }, {});
            console.log('✓ http_get (with headers):', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                console.log('  Data type:', typeof result.output?.data);
            }
            else {
                console.log('  Error:', result.error?.message);
            }
        }
        // http_post
        const httpPost = networkTools.find(t => t.name === 'http_post');
        if (httpPost) {
            const result = await httpPost.execute({
                url: 'https://httpbin.org/post',
                body: { message: 'hello from anode' }
            }, {});
            console.log('✓ http_post:', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                console.log('  Data type:', typeof result.output?.data);
            }
            else {
                console.log('  Error:', result.error?.message);
            }
        }
        // http_post with string body
        if (httpPost) {
            const result = await httpPost.execute({
                url: 'https://httpbin.org/post',
                body: 'plain text body'
            }, {});
            console.log('✓ http_post (string body):', result.success ? 'PASS' : 'FAIL');
            if (!result.success) {
                console.log('  Error:', result.error?.message);
            }
        }
        // http_request (generic GET)
        const httpReq = networkTools.find(t => t.name === 'http_request');
        if (httpReq) {
            const result = await httpReq.execute({
                url: 'https://httpbin.org/get',
                method: 'GET'
            }, {});
            console.log('✓ http_request (GET):', result.success ? 'PASS' : 'FAIL');
            if (!result.success) {
                console.log('  Error:', result.error?.message);
            }
        }
        // check_url
        const checkUrl = networkTools.find(t => t.name === 'check_url');
        if (checkUrl) {
            const result = await checkUrl.execute({
                url: 'https://www.baidu.com'
            }, {});
            console.log('✓ check_url:', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                console.log('  Accessible:', result.output?.isAccessible);
            }
            else {
                console.log('  Error:', result.error?.message);
            }
        }
        // download_file
        const download = networkTools.find(t => t.name === 'download_file');
        if (download) {
            const result = await download.execute({
                url: 'https://httpbin.org/robots.txt',
                path: './data/test-download.txt'
            }, {});
            console.log('✓ download_file:', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                console.log('  Size:', result.output?.size);
            }
            else {
                console.log('  Error:', result.error?.message);
            }
        }
        // upload_file - skipped
        console.log('✓ upload_file: SKIPPED (requires upload server)');
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
    // Test OCR Tools
    console.log('\n--- Testing OCR Tools ---');
    try {
        // ocr_recognize_screen (captures screen and recognizes text)
        const ocrScreen = ocrTools.find(t => t.name === 'ocr_recognize_screen');
        if (ocrScreen) {
            const result = await ocrScreen.execute({ language: 'chinese' }, {});
            console.log('✓ ocr_recognize_screen:', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                const text = result.output?.text || '';
                console.log('  Text length:', text.length);
                console.log('  Preview:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
            }
            else {
                console.log('  Error:', result.error?.message);
            }
        }
        // ocr_recognize_screen with latin
        if (ocrScreen) {
            const result = await ocrScreen.execute({ language: 'latin' }, {});
            console.log('✓ ocr_recognize_screen (latin):', result.success ? 'PASS' : 'FAIL');
            if (result.success) {
                const text = result.output?.text || '';
                console.log('  Text length:', text.length);
                console.log('  Preview:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
            }
            else {
                console.log('  Error:', result.error?.message);
            }
        }
        // ocr_recognize_file (needs an actual image file)
        const ocrFile = ocrTools.find(t => t.name === 'ocr_recognize_file');
        if (ocrFile) {
            // First take a screenshot to have a test image
            const screenshotPath = './data/ocr-test-screenshot.png';
            const androidScreenshot = androidTools.find(t => t.name === 'android_screenshot');
            if (androidScreenshot) {
                const ssResult = await androidScreenshot.execute({ path: screenshotPath }, {});
                if (ssResult.success) {
                    const result = await ocrFile.execute({ path: screenshotPath, language: 'chinese' }, {});
                    console.log('✓ ocr_recognize_file:', result.success ? 'PASS' : 'FAIL');
                    if (result.success) {
                        const text = result.output?.text || '';
                        console.log('  Text length:', text.length);
                        console.log('  Preview:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
                    }
                    else {
                        console.log('  Error:', result.error?.message);
                    }
                    // ocr_recognize_details
                    const ocrDetails = ocrTools.find(t => t.name === 'ocr_recognize_details');
                    if (ocrDetails) {
                        const detailResult = await ocrDetails.execute({ path: screenshotPath, language: 'chinese' }, {});
                        console.log('✓ ocr_recognize_details:', detailResult.success ? 'PASS' : 'FAIL');
                        if (detailResult.success) {
                            console.log('  Blocks:', detailResult.output?.blocks?.length || 0);
                            console.log('  Full text length:', (detailResult.output?.text || '').length);
                        }
                        else {
                            console.log('  Error:', detailResult.error?.message);
                        }
                    }
                }
                else {
                    console.log('✓ ocr_recognize_file: SKIPPED (screenshot failed)');
                    console.log('✓ ocr_recognize_details: SKIPPED (screenshot failed)');
                }
            }
            else {
                console.log('✓ ocr_recognize_file: SKIPPED (no screenshot tool)');
                console.log('✓ ocr_recognize_details: SKIPPED (no screenshot tool)');
            }
        }
    }
    catch (error) {
        console.error('✗ OCR Tools Error:', error);
    }
    console.log('\n=== Tool Integration Tests Complete ===');
}
// Run tests
testTools().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
