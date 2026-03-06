.PHONY: bundle

# Create a zip bundle suitable for upload to the Chrome Web Store.
# Output: bundle/persistent-pinned-tabs-for-brave.zip (bundle/ is gitignored).
bundle:
	@echo "Bundling extension for Chrome Web Store ..."
	@mkdir -p bundle
	@rm -f bundle/persistent-pinned-tabs-for-brave.zip
	@zip -r bundle/persistent-pinned-tabs-for-brave.zip . \
		-x "bundle/*" -x ".git/*" -x ".cursor/*" -x ".gitignore" -x "Makefile"
