import argparse
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By


parser = argparse.ArgumentParser(description='Test undetected-chromedriver against the Chromedriver Detector')
parser.add_argument('--tester', default='http://127.0.0.1:5500/index.html', help='URL of the test page')
parser.add_argument('--chrome-version', type=int, default=None, help='major version of chrome (eg 110)')
args = parser.parse_args()

chrome = uc.Chrome(version_main=args.chrome_version)
try:
    chrome.get(args.tester)
    chrome.find_element(By.CSS_SELECTOR, '#chromedriver-token').send_keys(
        chrome.execute_script('return window.token')
    )
    chrome.find_element(By.CSS_SELECTOR, '#chromedriver-asynctoken').send_keys(
        chrome.execute_async_script('window.getAsyncToken().then(arguments[0])')
    )
    chrome.find_element(By.CSS_SELECTOR, '#chromedriver-test').click()
    input('Test finished, check the result on the browser page.\nPress enter to exit...')
finally:
    chrome.quit()
