OUT_NAME=out.exe

.PHONY: all build pack
all: rsrc.syso build pack
	@echo "Finished"

rsrc.syso:
	@echo "Generating rsrc.syso..."
	@rsrc -ico ../../../public/favicon.ico -o rsrc.syso

build:
	@echo "Building..."
	@go build -ldflags="-s -w" -buildvcs=false -gcflags="all=-l -B" -trimpath -o $(OUT_NAME)

pack:
	@echo "Packing..."
	@upx -k $(OUT_NAME)
