package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"path"
	"time"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
)

var bucketName = "files-for-transfer"

func putObj(objectName, filePath string) error {
	type progressMsg struct {
		increment   int64
		transferred int64
		total       int64
	}
	type model struct {
		transferred int64
		total       int64
	}

	startU := time.Now()
	cwd, _ := os.Getwd()
	uploader := client.NewUploader(func(uo *oss.UploaderOptions) {
		uo.CheckpointDir = path.Join(cwd, "checkpoint")
		uo.EnableCheckpoint = true
		uo.PartSize = 64 * 1024
		// uo.ParallelNum = 5
	})
	request := &oss.PutObjectRequest{
		Bucket:       oss.Ptr(bucketName),
		Key:          oss.Ptr(objectName),
		StorageClass: oss.StorageClassStandard,
		Acl:          oss.ObjectACLPrivate,
		ProgressFn: func(increment, transferred, total int64) {
			fmt.Printf("increment:%v, transferred:%v, total:%v\n", increment, transferred, total)
		},
	}
	_, err := uploader.UploadFile(context.TODO(), request, filePath)
	if err != nil {
		fmt.Printf("Failed to upload file \"%s\": %v\n", filePath, err)
		return err
	}
	fmt.Printf("used %v to upload\n", time.Since(startU))

	fmt.Printf("Successfully uploaded file \"%s\"\n\n", objectName)
	return nil
}

func listObj(prefix string) ([]FileInfo, error) {
	// Return a FileInfo list with prefix in file names
	var fileInfo []FileInfo
	listRequest := &oss.ListObjectsV2Request{
		Bucket: oss.Ptr(bucketName),
		Prefix: oss.Ptr(prefix),
	}
	for {
		// Liist files
		lsRes, err := client.ListObjectsV2(context.TODO(), listRequest)
		if err != nil {
			return nil, err
		}
		for _, object := range lsRes.Contents {
			fileInfo = append(fileInfo, FileInfo{*object.Key, object.Size, *object.StorageClass})
		}

		// Continue if there's more files
		if lsRes.IsTruncated {
			listRequest.ContinuationToken = lsRes.NextContinuationToken
		} else {
			break
		}
	}
	return fileInfo, nil
}

func getObj(fileName, downloadPath, fullName string) {
	fmt.Printf("Start to download file \"%s\"\n", fileName)

	getRequest := &oss.GetObjectRequest{
		Bucket: oss.Ptr(bucketName),
		Key:    oss.Ptr(fullName),
	}
	result, err := client.GetObject(context.TODO(), getRequest)
	if err != nil {
		fmt.Printf("Failed to download file \"%s\" (Error: %v)\n", fileName, err)
		return
	}
	defer result.Body.Close()

	// Create file
	localFile, err := os.Create(downloadPath)
	if err != nil {
		fmt.Printf("Failed to create file: \"%s\" (Error: %v)\n", fileName, err)
		return
	}
	defer localFile.Close()

	// Write file
	_, err = io.Copy(localFile, result.Body)
	if err != nil {
		fmt.Printf("Failed to write file: \"%s\" (Error: %v)\n", fileName, err)
		return
	}

	fmt.Printf("Downloaded file \"%s\"\n", fileName)
}

func deleteMultiObj(deleteObjects []oss.DeleteObject) error {
	deleteRequest := &oss.DeleteMultipleObjectsRequest{
		Bucket: oss.Ptr(bucketName),
		Delete: &oss.Delete{
			Objects: deleteObjects,
		},
	}
	_, err := client.DeleteMultipleObjects(context.TODO(), deleteRequest)
	if err != nil {
		fmt.Printf("Failed to delete multiple objects: %v\n", err)
		return err
	}
	fmt.Print("Successfully deleted\n\n")
	return nil
}

func renameObj(srcName, destName string) error {
	copyRequest := &oss.CopyObjectRequest{
		Bucket:       oss.Ptr(bucketName),
		Key:          oss.Ptr(destName),
		SourceKey:    oss.Ptr(srcName),
		SourceBucket: oss.Ptr(bucketName),
		StorageClass: oss.StorageClassStandard,
	}
	_, err := client.CopyObject(context.TODO(), copyRequest)
	if err != nil {
		fmt.Printf("Failed to copy object: %v\n", err)
		return err
	}

	deleteRequest := &oss.DeleteObjectRequest{
		Bucket: oss.Ptr(bucketName),
		Key:    oss.Ptr(srcName),
	}
	_, err = client.DeleteObject(context.TODO(), deleteRequest)
	if err != nil {
		fmt.Printf("Failed to delete object: %v\n", err)
		return err
	}

	fmt.Printf("Successfully renamed file %s to %s\n\n", srcName, destName)
	return nil
}
