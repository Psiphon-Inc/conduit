package cmd

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/tabwriter"

	"github.com/Psiphon-Inc/conduit/cli/internal/config"
	"github.com/Psiphon-Inc/conduit/cli/internal/crypto"

	"github.com/skip2/go-qrcode"
	"github.com/spf13/cobra"
)

var ryveClaimCmd = &cobra.Command{
	Use:   "ryve-claim",
	Short: "Output Conduit claim data for Ryve",
	Long:  `Show Ryve Claim Qr-code in both terminal and PNG format.`,
	RunE:  runRyveClaim,
}

var (
	name                    string
	pngOutput               string
	defaultName             string
	defaultNameFromHostname bool
)

func init() {
	defaultName = "unnamed"
	defaultNameFromHostname = false

	if hostname, err := os.Hostname(); err == nil {
		defaultName = hostname
		defaultNameFromHostname = true
	}

	rootCmd.AddCommand(ryveClaimCmd)

	ryveClaimCmd.Flags().StringVarP(&name, "name", "n", defaultName, "Name for Ryve association")
	ryveClaimCmd.Flags().StringVarP(&pngOutput, "output", "o", "", "PNG output file path (optional)")

}

func generateQrCode(uri string) (string, error) {
	q, err := qrcode.New(uri, qrcode.Low)

	if err != nil {
		return "", fmt.Errorf("failed to generate QR code: %s", err)
	}

	terminalOutput := q.ToSmallString(false)
	if pngOutput != "" {
		if err := q.WriteFile(300, pngOutput); err != nil {
			return "", err
		}
	}

	return terminalOutput, nil

}

func runRyveClaim(cmd *cobra.Command, args []string) error {

	reader := bufio.NewReader(os.Stdin)
	fmt.Print("This command will reveal your station's private key to terminal output. Please only reveal in a secure location. Continue? (y/n) ")
	response, err := reader.ReadString('\n')
	if err != nil {
		return fmt.Errorf("failed to read confirmation: %w", err)
	}
	response = strings.TrimSpace(strings.ToLower(response))
	if response != "y" && response != "yes" {
		fmt.Println("Aborted.")
		return nil
	}

	datadir := GetDataDir()

	kp, _, err := config.LoadKey(datadir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			fmt.Println("Start your station first to create a key")
			return errors.New("missing key")
		}
		return fmt.Errorf("failed to load key: %w", err)
	}

	keyData, err := crypto.KeyPairToBase64NoPad(kp)
	if err != nil {
		return fmt.Errorf("failed to get keypair data: %w", err)
	}
	nameValue := name
	if defaultNameFromHostname && !cmd.Flags().Changed("name") {
		nameValue += " (use --name to explicitly set)"
	}

	proxyID, err := crypto.KeyPairToCurve25519Base64(kp)
	if err != nil {
		return fmt.Errorf("failed to derive proxy id: %w", err)
	}

	payload := map[string]any{
		"version": 1,
		"data": map[string]any{
			"name": name,
			"key":  keyData,
		},
	}

	payloadJson, err := json.Marshal(payload)
	if err != nil {
		fmt.Println("Error:", err)
		return fmt.Errorf("unexpected: failed to marshal payload: %s", err)
	}

	claim := base64.URLEncoding.EncodeToString(payloadJson)
	uri := "network.ryve.app://(app)/conduits?claim=" + claim

	if pngOutput == "" {
		pngOutput = filepath.Join(datadir, "ryve-claim-qr.png")
	}

	qrOutput, err := generateQrCode(uri)
	if err != nil {
		return fmt.Errorf("failed to generate QR code: %w", err)
	}
	writer := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintf(writer, "Station Name:\t%s\n", nameValue)
	fmt.Fprintf(writer, "Proxy ID:\t%s\n", proxyID)
	writer.Flush()
	fmt.Printf("claim QR code created at %s, scan this to claim this station in Ryve\n", pngOutput)
	fmt.Println(qrOutput)

	return nil
}
