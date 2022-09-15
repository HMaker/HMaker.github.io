/**
Copyright (c) 2022, HMaker
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

const Document_querySelector = Document.prototype.querySelector;
const Document_querySelectorAll = Document.prototype.querySelectorAll;


class SeleniumDetectionTest {

    constructor(name, desc) {
        this.name = name;
        this.desc = desc;
    }

    getDescriptionHTML() {
        return `<div class="test-detection"><strong>${this.name}</strong><div>${this.desc}</div></div>`;
    }
}


class JSCallStackTest extends SeleniumDetectionTest {

    constructor(name, desc, callStack, stackSignatures) {
        super(name, desc);
        this._callStack = callStack;
        this._stackSignatures = stackSignatures;
    }

    test() {
        if (this._callStack === null) return false;
        for (let i = 1; i < this._callStack.length; i++) {
            if (this._stackSignatures.some(signature => signature.test(this._callStack[i])))
                return true;
        }
        return false;
    }
}

/**
 * Hook into functions to look for JS callstacks specific to chromedriver script evaluations.
 */
class JSHookTest extends JSCallStackTest {

    constructor(name, desc, proto, func, stackSignatures) {
        super(name, desc, null, stackSignatures)
        this._proto = proto;
        this._func = func;
        this._hook();
    }

    _hook() {
        const self = this;
        const originalFunc = this._proto[this._func];
        this._proto[this._func] = function func() {
            try {
                null[0];
            } catch(e) {
                self._callStack = e.stack.split('\n');
            }
            return originalFunc.apply(this, arguments);
        }
    }
}


/**
 * Checks if window contains some constructor aliases created by chromedriver.
 *
 * see https://source.chromium.org/chromium/chromium/src/+/main:chrome/test/chromedriver/chrome/devtools_client_impl.cc;l=305-307
 */
class WindowConstructorAliasTest extends SeleniumDetectionTest {

    test(window) {
        // look for unpatched chromedriver
        for (const prop of window.Object.getOwnPropertyNames(window)) {
            if (/^cdc_[a-zA-Z0-9]{22}_(Array|Promise|Symbol)$/.test(prop)) return true;
        }
        // look for renamed cdc vars, here we expect to find 3 props which have same value of
        // window.Array, window.Promise and window.Symbol.
        function hasConstructorAlias(window, constructor) {
            for (const prop of window.Object.getOwnPropertyNames(window)) {
                if (prop == constructor.name || prop == 'token' || prop == 'getAsyncToken') continue;
                if (window[prop] === constructor) return true;
            }
            return false;
        }
        return hasConstructorAlias(window, window.Array) &&
            hasConstructorAlias(window, window.Promise) &&
            hasConstructorAlias(window, window.Symbol);
    }
}


/**
 * Look for vars created by chromedriver on document object.
 * 
 * see https://source.chromium.org/chromium/chromium/src/+/main:chrome/test/chromedriver/chrome/web_view_impl.cc;l=1413
 * https://source.chromium.org/chromium/chromium/src/+/main:chrome/test/chromedriver/js/execute_async_script.js;l=20
 * https://source.chromium.org/chromium/chromium/src/+/main:chrome/test/chromedriver/js/call_function.js;l=219
 */
class WindowDocumentAuxVarsTest extends SeleniumDetectionTest {

    test(window) {
        for (const prop of window.Object.getOwnPropertyNames(window.document)) {
            if (prop == '$chrome_asyncScriptInfo' || /^\$cdc_[a-zA-Z0-9]{22}_$/.test(prop)) return true;
        }
        // find cdc_asdjflasutopfhvcZLmcfl_ by matching prototype
        for (const desc of window.Object.values(window.Object.getOwnPropertyDescriptors(window.document))) {
            if (!desc.value || desc.value.cache_ === undefined) continue;
            const proto = window.Object.getOwnPropertyNames(window.Object.getPrototypeOf(desc.value));
            const expectedProto = ['storeItem', 'retrieveItem', 'isNodeReachable_']
            proto.sort()
            expectedProto.sort()
            if (proto.every((prop, i) => prop == expectedProto[i])) return true;
        }
        return false;
    }
}

/**
 * Detects CDP Runtime Domain enabled.
 * 
 * see https://source.chromium.org/chromium/chromium/src/+/main:v8/src/inspector/v8-runtime-agent-impl.cc;l=992
 */
class CDPRuntimeDomainTest extends SeleniumDetectionTest {

    test(window) {
        let trapped = false;
        const e = new Error();
        window.Object.defineProperty(e, 'stack', {
            configurable: false,
            enumerable: false,
            get: function() {
                trapped = true;
                return '';
            }
        });
        window.console.debug(e);
        return trapped;
    }

}


/**
 * see https://source.chromium.org/chromium/chromium/src/+/main:chrome/test/chromedriver/js/execute_script.js;l=13
 * https://source.chromium.org/chromium/chromium/src/+/main:chrome/test/chromedriver/js/call_function.js;l=426
 */
class ExecuteScriptTest extends JSCallStackTest {

    constructor(window, name, desc) {
        super(name, desc, null, [/ executeScript /, / callFunction /]);
        this._createToken(window);
    }

    _createToken(window) {
        this.token = Math.random().toString().substring(2);
        const self = this;
        window.Object.defineProperty(window, 'token', {
            configurable: false,
            enumerable: false,
            get: function() {
                try {
                    null[0];
                } catch(e) {
                    if (self._callStack === null)
                        self._callStack = e.stack.split('\n');
                }
                return self.token;
            }
        });
    }
}

/**
 * see https://source.chromium.org/chromium/chromium/src/+/main:chrome/test/chromedriver/js/execute_async_script.js;l=49
 */
class ExecuteAsyncScriptTest extends JSCallStackTest {

    constructor(window, name, desc) {
        super(name, desc, null, [/ executeAsyncScript /, / callFunction /]);
        this._createToken(window);
    }

    _createToken(window) {
        this.token = Math.random().toString().substring(2);
        const self = this;
        window.getAsyncToken = function() {
            return new Promise(resolve => {
                try {
                    null[0];
                } catch(e) {
                    if (self._callStack === null)
                        self._callStack = e.stack.split('\n');
                }
                setTimeout(() => resolve(self.token), 0);
            });
        }
    }
}


/**
 * @param {Array.<SeleniumDetectionTest>} detections 
 */
function displayDetectionResult(detections, isPartial=false) {
    if (detections.length > 0) {
        const status = Document_querySelector.call(document, '#chromedriver-test-container .test-status');
        status.textContent = 'Detected!';
        status.classList.remove('test-status-passed');
        status.classList.remove('test-status-partially-passed');
        status.classList.add('test-status-detected');
        Document_querySelector.call(document, '#chromedriver-test-container .modal-content').innerHTML = detections.map(
            thetest => thetest.getDescriptionHTML()
        ).join('');
        const testResult = Document_querySelector.call(document, '#chromedriver-test-container .test-result');
        testResult.textContent = `${detections.length} detections`;
        testResult.onclick = function() {
            Document_querySelector.call(document, '#chromedriver-test-container .modal-container').classList.add('modal-visible');
        }
    } else {
        const status = Document_querySelector.call(document, '#chromedriver-test-container .test-status');
        if (isPartial) {
            status.textContent = 'Passing...';
            status.classList.remove('test-status-detected');
            status.classList.add('test-status-partially-passed');
        } else {
            status.textContent = 'Passed!';
            status.classList.remove('test-status-detected');
            status.classList.remove('test-status-partially-passed');
            status.classList.add('test-status-passed');
        }
    }
}


(function() {
    const executeScriptTest = new ExecuteScriptTest(
        window,
        'execute-script',
        '<pre>driver.execute_script()</pre> usage'
    );
    const executeAsyncScriptTest = new ExecuteAsyncScriptTest(
        window,
        'execute-async-script',
        '<pre>driver.execute_async_script()</pre> usage'
    );
    const passiveTests = [
        new WindowConstructorAliasTest(
            'window-constructors-alias',
            '<pre>cdc_..._Array</pre>, <pre>cdc_..._Promise</pre> and <pre>cdc_..._Symbol</pre> vars on Window'
        )
    ];
    const iframePassiveTests = [
        new WindowConstructorAliasTest(
            'window-constructors-alias-iframe',
            '<pre>cdc_..._Array</pre>, <pre>cdc_..._Promise</pre> and <pre>cdc_..._Symbol</pre> vars on Window from an iframe'
        ),
        new CDPRuntimeDomainTest(
            'devtools-console',
            'Either Devtools Console is open or CDP Runtime Domain is enabled'
        )
    ];
    const activeTests = [
        new WindowDocumentAuxVarsTest(
            'window-document-aux-vars',
            '<pre>$cdc_..._</pre> and <pre>$chrome_asyncScriptInfo</pre> vars on document'
        ),
        executeScriptTest,
        executeAsyncScriptTest,
        new JSHookTest(
            'find-element',
            '<pre>driver.find_element()</pre> usage',
            Document.prototype,
            'querySelector',
            [/ apply\.css selector /]
        ),
        new JSHookTest(
            'find-elements',
            '<pre>driver.find_elements()</pre> usage',
            Document.prototype,
            'querySelectorAll',
            [/ apply\.css selector /]
        ),
        new JSHookTest(
            'element-find-element',
            '<pre>element.find_element()</pre> usage',
            Element.prototype,
            'querySelector',
            [/ apply\.css selector /]
        ),
        new JSHookTest(
            'element-find-elements',
            '<pre>element.find_elements()</pre> usage',
            Element.prototype,
            'querySelectorAll',
            [/ apply\.css selector /]
        )
    ]
    window.addEventListener('DOMContentLoaded', function() {
        const iframe = document.createElement('iframe')
        iframe.style = 'display: none';
        document.body.appendChild(iframe);
        const detections = passiveTests.filter(thetest => thetest.test(window));
        detections.push(...iframePassiveTests.filter(thetest => thetest.test(iframe.contentWindow)));
        displayDetectionResult(detections, true);
        Document_querySelector.call(document, '#chromedriver-test').onclick = function() {
            const filledToken = Document_querySelector.call(document, '#chromedriver-token');
            const filledAsyncToken = Document_querySelector.call(document, '#chromedriver-asynctoken');
            if (filledToken.value != executeScriptTest.token) {
                filledToken.classList.add('test-token-error');
                const status = Document_querySelector.call(document, '#chromedriver-test-container .test-status');
                status.textContent = 'Error!';
                return;
            }
            if (filledAsyncToken.value != executeAsyncScriptTest.token) {
                filledAsyncToken.classList.add('test-token-error');
                const status = Document_querySelector.call(document, '#chromedriver-test-container .test-status');
                status.textContent = 'Error!';
                return;
            }
            detections.push(...activeTests.filter(thetest => thetest.test(window)));
            displayDetectionResult(detections, false);
        }
        Document_querySelectorAll.call(document, '.modal-container').forEach(modal => {
            modal.onclick = function(event) {
                if (event.target === modal) modal.classList.remove('modal-visible');
            }
        })
    });
})();
