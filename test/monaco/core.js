/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as monaco from 'monaco-editor-core';

self.MonacoEnvironment = {
	getWorker: function (moduleId, label) {
		return new Worker(new URL('./editorWebWorkerMain.bundle.js', self.location.href), {
			name: label
		});
	}
};

window.instance = monaco.editor.create(document.getElementById('container'), {
	value: [
		'from banana import *',
		'',
		'class Monkey:',
		'	# Bananas the monkey can eat.',
		'	capacity = 10',
		'	def eat(self, N):',
		'		\'\'\'Make the monkey eat N bananas!\'\'\'',
		'		capacity = capacity - N*banana.size',
		'',
		'	def feeding_frenzy(self):',
		'		eat(9.25)',
		'		return "Yum yum"',
	].join('\n'),
	language: 'python'
});
