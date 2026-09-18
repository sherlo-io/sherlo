# Sherlo Staged Gate action - deprecated

**Use [`sherlo-io/sherlo@v2`](../../action.yml) instead.** This action still works
- it delegates to the root action's body unchanged - but it will not gain new
inputs or outputs.

> **📚 For full documentation, visit [sherlo.io/docs](https://sherlo.io/docs)**

<br />

## Why it was superseded

The root action runs the same one verb, `sherlo test`, and does more with it:
give it `android` / `ios` build paths and it runs the full test that registers a
fresh native base, so BOTH jobs of a staged workflow use one action. It also
publishes the run's `url`.

<br />

## Migrating

```diff
- - uses: sherlo-io/sherlo/actions/staged-gate@v1
+ - uses: sherlo-io/sherlo@v2
    with:
-     sherlo-token: ${{ secrets.SHERLO_TOKEN }}
+     token: ${{ secrets.SHERLO_TOKEN }}
```

The token input is the only renamed one: `sherlo-token` here, `token` there.
`working-directory` and `config` keep their names, the `native-needed`, `reason`
and `base-fingerprint` outputs keep theirs, and routing is unchanged - branch on
`needs.<job>.outputs.native-needed`, never on an exit code.

The follow-up native job moves to the same action:

```diff
- - run: npx sherlo test --android android.apk --ios ios.tar.gz --token ${{ secrets.SHERLO_TOKEN }}
+ - uses: sherlo-io/sherlo@v2
+   with:
+     token: ${{ secrets.SHERLO_TOKEN }}
+     android: android.apk
+     ios: ios.tar.gz
```

See [`examples/staged`](../../examples/staged) for the full workflow, and the
[root action](../../action.yml) for every input and output.
