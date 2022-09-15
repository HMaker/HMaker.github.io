import undetected_chromedriver as uc
from selenium.webdriver.common.by import By


chrome = uc.Chrome(version_main=105)
try:
    chrome.get('http://127.0.0.1:5500/index.html')
    chrome.find_element(By.CSS_SELECTOR, '#chromedriver-token').send_keys(
        chrome.execute_script('return window.token')
    )
    chrome.find_element(By.CSS_SELECTOR, '#chromedriver-asynctoken').send_keys(
        chrome.execute_async_script('window.getAsyncToken().then(arguments[0])')
    )
    chrome.find_element(By.CSS_SELECTOR, '#chromedriver-test').click()
    input('Press any key to exit...')
finally:
    chrome.quit()
