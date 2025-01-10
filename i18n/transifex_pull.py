#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Copyright (c) 2025, Psiphon Inc.
# All rights reserved.
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

'''
Pulls and massages our translations from Transifex.

Install uv: https://github.com/astral-sh/uv?tab=readme-ov-file#installation

Then::
$ uv run transifex_pull.py
'''


import os
import subprocess
import transifexlib


# The locale strings being mapped to must be valid BCP 47 in one of these forms:
#   zh, zh-TW, zh-Hant, zh-Hant-TW
CORE_LANGS = {
    'ar': 'ar',         # Arabic
    'de': 'de',         # German
    'es': 'es',         # Spanish
    'fa': 'fa',         # Farsi/Persian
    'fr': 'fr',         # French
    'hi': 'hi',         # Hindi
    'id': 'id',         # Indonesian
    'pt_BR': 'pt_BR',   # Portuguese (Brazil)
    'pt_PT': 'pt_PT',   # Portuguese (Portugal)
    'sw': 'sw',         # Swahili
    'tr': 'tr',         # Turkish
    'ur': 'ur',         # Urdu
    'vi': 'vi',         # Vietnamese
}

ANDROID_LANGS = CORE_LANGS | {
    # Android's region codes are like 'pt-rBR' instead of 'pt_BR'
    'pt_BR': 'pt-rBR',   # Portuguese (Brazil)
    'pt_PT': 'pt',      # Portuguese (Portugal and everywhere else)
}


def pull_core_translations():
    transifexlib.process_resource(
        'https://app.transifex.com/otf/Psiphon3/conduit-core/',
        CORE_LANGS,
        '../src/i18n/locales/es/translation.json',
        lambda lang: f'../src/i18n/locales/{lang}/translation.json',
        None) # no mutator


def pull_android_translations():
    transifexlib.process_resource(
        'https://app.transifex.com/otf/Psiphon3/conduit-android/',
        ANDROID_LANGS,
        '../android/app/src/main/res/values/strings.xml',
        lambda lang: f'../android/app/src/main/res/values-{lang}/strings.xml',
        None) # no mutator


def go():
    pull_core_translations()
    print('Complete')
    pull_android_translations()
    print('Complete')

    print('\nFinished translation pull')


if __name__ == '__main__':
    go()
